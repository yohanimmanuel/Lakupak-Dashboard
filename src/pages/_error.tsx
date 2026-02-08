/**
 * Pages Router _error. Custom implementation so Next.js does not use the default
 * _error that imports next/document Html (which breaks static export in hybrid app).
 */
import type { NextPageContext } from 'next';

interface ErrorProps {
  statusCode?: number;
  err?: Error;
}

function ErrorPage({ statusCode = 500 }: ErrorProps) {
  const is404 = statusCode === 404;
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <h1 style={{ fontSize: '2.25rem', fontWeight: 700, color: '#1f2937' }}>{statusCode}</h1>
      <p style={{ marginTop: 8, fontSize: '1.125rem', color: '#4b5563' }}>
        {is404 ? 'Page not found' : 'Something went wrong'}
      </p>
      <a href="/" style={{ marginTop: 24, padding: '8px 16px', background: '#111', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}>
        Back to home
      </a>
    </div>
  );
}

ErrorPage.getInitialProps = async ({ res, err }: NextPageContext): Promise<ErrorProps> => {
  const statusCode = res ? res.statusCode : err ? (err as { statusCode?: number }).statusCode : 404;
  return { statusCode: statusCode ?? 404 };
};

export default ErrorPage;
