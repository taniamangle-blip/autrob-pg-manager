import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import PlatformAdmin from './PlatformAdmin';
import NetworkPages from './NetworkPages';
import './styles.css';
import './login.css';
import './platform-admin.css';
import './overview-dashboard.css';

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Nivasbook failed to render:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f4f7f5', color: '#26352e', fontFamily: 'Arial, sans-serif' }}>
        <section style={{ width: 'min(100%, 560px)', padding: 28, border: '1px solid #e0e8e3', borderRadius: 16, background: '#fff', boxShadow: '0 16px 50px #193b2c12' }}>
          <strong style={{ color: '#28775b', letterSpacing: 1 }}>NIVASBOOK</strong>
          <h1 style={{ margin: '12px 0 8px', fontSize: 22 }}>The page encountered an error</h1>
          <p style={{ color: '#68766f', lineHeight: 1.6 }}>The app started, but couldn’t render this screen. Reload the page; if it happens again, share the error below.</p>
          <pre style={{ padding: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', borderRadius: 8, background: '#f6f8f7', color: '#954a42', fontSize: 12 }}>{this.state.error}</pre>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 16px', border: 0, borderRadius: 8, background: '#288567', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Reload app</button>
        </section>
      </main>;
    }
    return this.props.children;
  }
}

const webNetworkPath=/^\/(stay|find-a-pg|how-it-works|about|faqs|contact|privacy|terms|marketplace|booking-leads|public-listings)(\/|$)/.test(window.location.pathname)&&!window.autrobDesktop?.isDesktop;
const application=window.location.pathname==='/platform/network'||window.location.pathname==='/platform'?<PlatformAdmin/>:webNetworkPath?<NetworkPages/>:<App/>;
document.documentElement.dataset.nivasbookReady = 'true';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AppErrorBoundary>{application}</AppErrorBoundary></React.StrictMode>);
