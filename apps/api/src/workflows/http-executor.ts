import {
  lookup,
} from 'node:dns/promises';
import {
  BlockList,
  isIP,
} from 'node:net';
import {
  Agent,
  buildConnector,
  fetch,
} from 'undici';
import type {
  ExecuteWorkflowDto,
} from './workflow.schemas.js';

type WorkflowData =
  ExecuteWorkflowDto[
    'nodes'
  ][number]['data'];

type HttpConfig =
  Extract<
    WorkflowData,
    { kind: 'http' }
  >['config'];

type WorkflowContext =
  Record<string, unknown>;

const MAX_RESPONSE_BYTES =
  64 * 1024;

const RETRYABLE_METHODS =
  new Set([
    'GET',
    'PUT',
    'DELETE',
  ]);

const RETRYABLE_STATUSES =
  new Set([
    408,
    425,
    429,
    500,
    502,
    503,
    504,
  ]);

const BLOCKED_HEADERS =
  new Set([
    'host',
    'content-length',
    'connection',
    'transfer-encoding',
    'upgrade',
    'proxy-authorization',
    'proxy-authenticate',
    'te',
    'trailer',
  ]);

const blockedAddresses =
  new BlockList();

blockedAddresses.addSubnet(
  '0.0.0.0',
  8,
  'ipv4',
);

blockedAddresses.addSubnet(
  '10.0.0.0',
  8,
  'ipv4',
);

blockedAddresses.addSubnet(
  '100.64.0.0',
  10,
  'ipv4',
);

blockedAddresses.addSubnet(
  '127.0.0.0',
  8,
  'ipv4',
);

blockedAddresses.addSubnet(
  '169.254.0.0',
  16,
  'ipv4',
);

blockedAddresses.addSubnet(
  '172.16.0.0',
  12,
  'ipv4',
);

blockedAddresses.addSubnet(
  '192.168.0.0',
  16,
  'ipv4',
);

for (const address of [
  '192.0.0.0',
  '192.0.2.0',
  '192.88.99.0',
  '198.51.100.0',
  '203.0.113.0',
]) {
  blockedAddresses.addSubnet(address, 24, 'ipv4');
}

blockedAddresses.addSubnet(
  '198.18.0.0',
  15,
  'ipv4',
);

blockedAddresses.addSubnet(
  '224.0.0.0',
  4,
  'ipv4',
);

blockedAddresses.addSubnet(
  '240.0.0.0',
  4,
  'ipv4',
);

blockedAddresses.addAddress(
  '::',
  'ipv6',
);

blockedAddresses.addAddress(
  '::1',
  'ipv6',
);

blockedAddresses.addSubnet(
  '64:ff9b::',
  96,
  'ipv6',
);

blockedAddresses.addSubnet('64:ff9b:1::', 48, 'ipv6');

blockedAddresses.addSubnet(
  '100::',
  64,
  'ipv6',
);

blockedAddresses.addSubnet(
  'fc00::',
  7,
  'ipv6',
);

blockedAddresses.addSubnet(
  'fe80::',
  10,
  'ipv6',
);

blockedAddresses.addSubnet(
  'ff00::',
  8,
  'ipv6',
);

blockedAddresses.addSubnet(
  '2001:db8::',
  32,
  'ipv6',
);

blockedAddresses.addSubnet('2001::', 23, 'ipv6');
blockedAddresses.addSubnet('2002::', 16, 'ipv6');

class UnsafeHttpTargetError
  extends Error {}

class HttpConfigError
  extends Error {}

class HttpStatusError
  extends Error {}

function sleep(
  milliseconds: number,
) {
  return new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}

function normalizeHostname(
  hostname: string,
) {
  return hostname
    .replace(
      /^\[|\]$/g,
      '',
    )
    .replace(
      /\.$/,
      '',
    )
    .toLowerCase();
}

function isBlockedHostname(
  hostname: string,
) {
  const blockedExact =
    new Set([
      'localhost',
      'metadata.google.internal',
      'metadata.amazonaws.com',
    ]);

  if (
    blockedExact.has(
      hostname,
    )
  ) {
    return true;
  }

  return [
    '.localhost',
    '.local',
    '.internal',
    '.lan',
  ].some(
    (suffix) =>
      hostname.endsWith(
        suffix,
      ),
  );
}

function isBlockedIp(
  address: string,
  family?: number,
) {
  const detectedFamily =
    family ??
    isIP(address);

  if (
    detectedFamily !== 4 &&
    detectedFamily !== 6
  ) {
    throw new UnsafeHttpTargetError(
      'Target resolved to an invalid IP address.',
    );
  }

  return blockedAddresses.check(
    address,
    detectedFamily === 6
      ? 'ipv6'
      : 'ipv4',
  );
}

async function resolvePublicTarget(
  url: URL,
) {
  if (
    url.protocol !== 'http:' &&
    url.protocol !== 'https:'
  ) {
    throw new UnsafeHttpTargetError(
      'Only HTTP and HTTPS URLs are allowed.',
    );
  }

  if (
    url.username ||
    url.password
  ) {
    throw new UnsafeHttpTargetError(
      'Credentials are not allowed in HTTP URLs.',
    );
  }

  const expectedPort =
    url.protocol === 'https:'
      ? 443
      : 80;

  const port =
    url.port
      ? Number(url.port)
      : expectedPort;

  if (
    port !== expectedPort
  ) {
    throw new UnsafeHttpTargetError(
      `Only port ${expectedPort} is allowed for ${url.protocol}`,
    );
  }

  const hostname =
    normalizeHostname(
      url.hostname,
    );

  if (
    isBlockedHostname(
      hostname,
    )
  ) {
    throw new UnsafeHttpTargetError(
      'HTTP target points to a local or internal hostname.',
    );
  }

  const directFamily =
    isIP(hostname);

  const addresses =
    directFamily
      ? [
          {
            address:
              hostname,
            family:
              directFamily,
          },
        ]
      : await lookup(
          hostname,
          {
            all: true,
            order:
              'verbatim',
          },
        );

  if (
    addresses.length === 0
  ) {
    throw new Error(
      'HTTP target did not resolve to an address.',
    );
  }

  for (
    const resolved
    of addresses
  ) {
    if (
      isBlockedIp(
        resolved.address,
        resolved.family,
      )
    ) {
      throw new UnsafeHttpTargetError(
        'HTTP target resolves to a private, local, or reserved network.',
      );
    }
  }

  return {
    hostname,
    address:
      (addresses.find((entry) => entry.family === 4) ?? addresses[0]).address,
  };
}

function hasOwn(
  value: object,
  key: string,
) {
  return Object.prototype
    .hasOwnProperty
    .call(
      value,
      key,
    );
}

function resolveContextValue(
  context: WorkflowContext,
  path: string,
): unknown {
  const parts =
    path.split('.');

  for (
    let prefixLength =
      parts.length;
    prefixLength >= 1;
    prefixLength -= 1
  ) {
    const prefix =
      parts
        .slice(
          0,
          prefixLength,
        )
        .join('.');

    if (
      !hasOwn(
        context,
        prefix,
      )
    ) {
      continue;
    }

    let current:
      unknown =
      context[prefix];

    for (
      const segment
      of parts.slice(
        prefixLength,
      )
    ) {
      if (
        typeof current !==
          'object' ||
        current === null ||
        !hasOwn(
          current,
          segment,
        )
      ) {
        throw new HttpConfigError(
          `Variable "{{${path}}}" does not exist.`,
        );
      }

      current =
        (
          current as
            Record<
              string,
              unknown
            >
        )[segment];
    }

    return current;
  }

  throw new HttpConfigError(
    `Variable "{{${path}}}" does not exist.`,
  );
}

function templateValue(
  value: unknown,
) {
  if (
    typeof value ===
      'string'
  ) {
    return value;
  }

  if (
    value === null
  ) {
    return 'null';
  }

  if (
    typeof value ===
      'object'
  ) {
    return JSON.stringify(
      value,
    );
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  throw new HttpConfigError('HTTP template contains an unsupported variable value.');
}

export function interpolateTemplate(
  template: string,
  context: WorkflowContext,
) {
  return template.replace(
    /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g,
    (
      _match,
      path: string,
    ) =>
      templateValue(
        resolveContextValue(
          context,
          path,
        ),
      ),
  );
}

function parseHeaders(
  value: string,
) {
  let parsed:
    unknown;

  try {
    parsed =
      JSON.parse(
        value || '{}',
      );
  } catch {
    throw new HttpConfigError(
      'HTTP headers must be valid JSON.',
    );
  }

  if (
    typeof parsed !==
      'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new HttpConfigError(
      'HTTP headers must be a JSON object.',
    );
  }

  const entries =
    Object.entries(
      parsed,
    );

  if (
    entries.length > 50
  ) {
    throw new HttpConfigError(
      'HTTP request contains too many headers.',
    );
  }

  const headers:
    Record<
      string,
      string
    > = {};

  for (
    const [name, rawValue]
    of entries
  ) {
    const lowerName =
      name.toLowerCase();

    if (
      BLOCKED_HEADERS.has(
        lowerName,
      )
    ) {
      throw new HttpConfigError(
        `Header "${name}" is controlled by NexFlow and cannot be set manually.`,
      );
    }

    if (
      typeof rawValue !==
        'string'
    ) {
      throw new HttpConfigError(
        `Header "${name}" must contain a string value.`,
      );
    }

    if (
      /[\r\n]/.test(
        rawValue,
      )
    ) {
      throw new HttpConfigError(
        `Header "${name}" contains invalid newline characters.`,
      );
    }

    headers[name] =
      rawValue;
  }

  return headers;
}

async function readLimitedBody(
  response: Awaited<ReturnType<typeof fetch>>,
) {
  if (
    !response.body
  ) {
    return '';
  }

  const reader =
    response.body
      .getReader();

  const decoder =
    new TextDecoder();

  let total = 0;
  let text = '';

  try {
    while (true) {
      const {
        done,
        value,
      } =
        await reader.read();

      if (done) {
        break;
      }

      total +=
        value.byteLength;

      if (
        total >
        MAX_RESPONSE_BYTES
      ) {
        await reader.cancel();

        throw new Error(
          'HTTP response exceeded the 64 KB NexFlow limit.',
        );
      }

      text +=
        decoder.decode(
          value,
          {
            stream: true,
          },
        );
    }

    text +=
      decoder.decode();

    return text;
  } finally {
    reader.releaseLock();
  }
}

function parseResponseBody(
  contentType: string | null,
  text: string,
) {
  if (!text) {
    return null;
  }

  if (
    contentType
      ?.toLowerCase()
      .includes('json')
  ) {
    try {
      return JSON.parse(
        text,
      ) as unknown;
    } catch {
      return text;
    }
  }

  return text;
}

function createPinnedAgent(
  originalHostname: string,
  address: string,
) {
  const connector =
    buildConnector({});

  return new Agent({
    connect(
      options,
      callback,
    ) {
      connector(
        {
          ...options,

          hostname:
            address,

          servername:
            isIP(
              originalHostname,
            )
              ? options.servername
              : originalHostname,
        },
        callback,
      );
    },
  });
}

async function performRequest(
  url: URL,
  method: HttpConfig['method'],
  headers:
    Record<string, string>,
  body: string | undefined,
  timeout: number,
) {
  const target =
    await resolvePublicTarget(
      url,
    );

  const agent =
    createPinnedAgent(
      target.hostname,
      target.address,
    );

  try {
    const response =
      await fetch(
        url,
        {
          method,
          headers,
          body,

          redirect:
            'manual',

          signal:
            AbortSignal.timeout(
              timeout,
            ),

          dispatcher:
            agent,
        },
      );

    if (
      response.status >= 300 &&
      response.status <= 399
    ) {
      await response.body
        ?.cancel();

      throw new UnsafeHttpTargetError(
        'HTTP redirects are disabled for security.',
      );
    }

    const text =
      await readLimitedBody(
        response,
      );

    return {
      status:
        response.status,

      statusText:
        response.statusText,

      contentType:
        response.headers.get(
          'content-type',
        ),

      body:
        parseResponseBody(
          response.headers.get(
            'content-type',
          ),
          text,
        ),
    };
  } finally {
    await agent.close()
      .catch(() => undefined);
  }
}

function displayUrl(
  url: URL,
) {
  return (
    url.origin +
    url.pathname
  );
}

export async function executeHttpRequest(
  nodeId: string,
  config: HttpConfig,
  context: WorkflowContext,
) {
  const resolvedUrl =
    interpolateTemplate(
      config.url,
      context,
    );

  let url: URL;

  try {
    url =
      new URL(
        resolvedUrl,
      );
  } catch {
    throw new HttpConfigError(
      `Invalid HTTP URL: ${resolvedUrl}`,
    );
  }

  const headerText =
    interpolateTemplate(
      config.headers ||
        '{}',
      context,
    );

  const headers =
    parseHeaders(
      headerText,
    );

  let body:
    string | undefined;

  if (
    config.method !==
      'GET' &&
    config.body.trim()
  ) {
    body =
      interpolateTemplate(
        config.body,
        context,
      );

    try {
      JSON.parse(body);
    } catch {
      throw new HttpConfigError(
        'HTTP request body must be valid JSON after variable interpolation.',
      );
    }

    if (
      !Object.keys(
        headers,
      ).some(
        (name) =>
          name.toLowerCase() ===
          'content-type',
      )
    ) {
      headers[
        'Content-Type'
      ] =
        'application/json';
    }
  }

  const retries =
    config.retries ?? 0;

  const retryDelayMs =
    config.retryDelayMs ??
    500;

  const mayRetry =
    RETRYABLE_METHODS.has(
      config.method,
    );

  let lastError:
    unknown;

  for (
    let attempt = 0;
    attempt <= retries;
    attempt += 1
  ) {
    try {
      const result =
        await performRequest(
          url,
          config.method,
          headers,
          body,
          config.timeout,
        );

      if (
        result.status < 200 ||
        result.status >= 300
      ) {
        const error =
          new HttpStatusError(
            `HTTP ${result.status} ${result.statusText || 'request failed'}`,
          );

        const shouldRetry =
          mayRetry &&
          RETRYABLE_STATUSES.has(
            result.status,
          ) &&
          attempt < retries;

        if (!shouldRetry) {
          throw new HttpStatusError(
            `${error.message} (${attempt + 1} attempt${attempt === 0 ? '' : 's'})`,
          );
        }

        lastError =
          error;
      } else {
        const attempts =
          attempt + 1;

        return {
          response: {
            status:
              result.status,

            statusText:
              result.statusText,

            url:
              displayUrl(
                url,
              ),

            body:
              result.body,

            attempts,
          },

          message:
            `${config.method} ${displayUrl(url)} → ${result.status} (${attempts} attempt${attempts === 1 ? '' : 's'})`,
        };
      }
    } catch (error) {
      if (
        error instanceof
          UnsafeHttpTargetError ||
        error instanceof
          HttpConfigError ||
        error instanceof
          HttpStatusError
      ) {
        throw error;
      }

      lastError =
        error;

      if (
        !mayRetry ||
        attempt >= retries
      ) {
        if (
          error instanceof
            DOMException &&
          error.name ===
            'TimeoutError'
        ) {
          throw new Error(
            `HTTP request timed out after ${config.timeout} ms.`,
          );
        }

        throw error;
      }
    }

    const backoff =
      retryDelayMs *
      2 ** attempt;

    await sleep(
      backoff,
    );
  }

  throw (
    lastError ??
    new Error(
      `HTTP request for ${nodeId} failed.`,
    )
  );
}
