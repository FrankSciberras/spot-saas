import { API_BASE_PATH, type DocEndpoint } from '@/lib/api/docs';
import CodeBlock from './CodeBlock';
import styles from './docs.module.css';

/**
 * One endpoint in the reference: the signature, what it does, its parameters
 * and a worked cURL example. Rendered from lib/api/docs.ts so this page and
 * the OpenAPI spec can never disagree about what the API accepts.
 */
export default function EndpointCard({ endpoint: ep }: { endpoint: DocEndpoint }) {
  const fullPath = `${API_BASE_PATH}${ep.path}`;

  // A runnable example, with the path params filled in so it can be pasted.
  const curlPath = fullPath.replace(/\{(\w+)\}/g, '3b1c8f22-7a64-4c19-9e0a-51d7c2f9ab34');
  const curl = [
    `curl ${ep.method !== 'GET' ? `-X ${ep.method} ` : ''}https://rovora.eu${curlPath}${
      ep.method === 'GET' && ep.query?.length ? '?limit=25' : ''
    } \\`,
    `  -H "Authorization: Bearer $ROVORA_API_KEY"${ep.requestExample ? ' \\' : ''}`,
    ...(ep.requestExample
      ? [
          '  -H "Content-Type: application/json" \\',
          `  -d '${ep.requestExample.replace(/\n\s*/g, ' ').replace(/'/g, "'\\''")}'`,
        ]
      : []),
  ].join('\n');

  return (
    <article className={styles.endpoint} id={ep.id}>
      <div className={styles.endpointHead}>
        <span className={styles[`m_${ep.method}`]}>{ep.method}</span>
        <code className={styles.endpointPath}>{fullPath}</code>
      </div>

      <h4 className={styles.endpointTitle}>{ep.summary}</h4>
      <p className={styles.endpointDesc}>{ep.description}</p>

      <div className={styles.endpointMeta}>
        <span className={styles.metaLabel}>Scope</span>
        {ep.scope ? (
          <code className={styles.scopeChip}>{ep.scope}</code>
        ) : (
          <span className={styles.metaValue}>Any live key</span>
        )}
        <span className={styles.metaLabel}>Returns</span>
        <span className={styles.metaValue}>
          {ep.successStatus === 204 ? '204 No Content' : `${ep.successStatus ?? 200} OK`}
        </span>
      </div>

      {ep.query && ep.query.length > 0 && (
        <>
          <h5 className={styles.paramsTitle}>Query parameters</h5>
          <div className={styles.params}>
            {ep.query.map((q) => (
              <div className={styles.param} key={q.name}>
                <div className={styles.paramName}>
                  <code>{q.name}</code>
                  <span className={styles.paramType}>{q.type}</span>
                  {q.required && <span className={styles.required}>required</span>}
                </div>
                <p className={styles.paramDesc}>{q.description}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {ep.body && ep.body.length > 0 && (
        <>
          <h5 className={styles.paramsTitle}>Body fields</h5>
          <div className={styles.params}>
            {ep.body.map((f) => (
              <div className={styles.param} key={f.name}>
                <div className={styles.paramName}>
                  <code>{f.name}</code>
                  <span className={styles.paramType}>{f.type}</span>
                  {f.required && <span className={styles.required}>required</span>}
                </div>
                <p className={styles.paramDesc}>{f.description}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <CodeBlock code={curl} label="cURL" />
      {ep.responseExample && <CodeBlock code={ep.responseExample} label="Response" />}
    </article>
  );
}
