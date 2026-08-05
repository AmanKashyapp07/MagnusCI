import React from 'react';

export default function AuthLanding({ dbStatus = "connected", initiateGithubLogin }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap');
        
        /* Anthropic-inspired color palette */
        .anthropic-theme {
          --bg-primary: #F4F3EE;
          --bg-secondary: #EBEAE4;
          --bg-card: #FAF9F6;
          --text-primary: #1A1A19;
          --text-secondary: #5C5C58;
          --border-subtle: #D8D7D1;
          --border-hover: #A3A29D;
          --accent: #D97757;
          --status-success: #3A6B4C;
          --status-failed: #A34343;
        }

        .font-serif {
          font-family: 'Newsreader', Georgia, serif;
        }
        .font-sans {
          font-family: 'Inter', system-ui, sans-serif;
        }

        .anthropic-btn {
          background-color: var(--text-primary);
          color: var(--bg-primary);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .anthropic-btn:hover {
          background-color: #333332;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .anthropic-card {
          background-color: var(--bg-card);
          border: 1px solid var(--border-subtle);
          transition: border-color 0.2s ease, transform 0.2s ease;
        }
        .anthropic-card:hover {
          border-color: var(--border-hover);
        }
      `}} />

      {}
      <div className="anthropic-theme min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans flex flex-col relative overflow-x-hidden selection:bg-[var(--text-primary)] selection:text-[var(--bg-primary)]">
        
        {}
        <header className="w-full border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] z-20 sticky top-0">
          <div className="max-w-[1400px] mx-auto flex justify-between items-center px-6 py-4">
            <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
              <div className="w-6 h-6 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded-sm flex items-center justify-center">
                <span className="font-serif font-medium text-sm leading-none">M</span>
              </div>
              <h1 className="text-xl tracking-tight text-[var(--text-primary)] font-serif font-medium">
                Magnus<span className="italic opacity-70">CI</span>
              </h1>
            </div>
            
            <div className="flex items-center gap-2 border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1.5 rounded-md shadow-sm">
              <span className="relative flex h-2 w-2">
                {dbStatus === "connected" && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--status-success)] opacity-75" />}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${dbStatus === "connected" ? "bg-[var(--status-success)]" : "bg-[var(--status-failed)]"}`} />
              </span>
              <span className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-widest">
                System {dbStatus === "connected" ? "Operational" : "Degraded"}
              </span>
            </div>
          </div>
        </header>

        {}
        <main className="flex-1 flex flex-col w-full max-w-[1400px] mx-auto px-6 pt-16 md:pt-28 pb-20 z-10">
          
          <div className="flex flex-col lg:flex-row gap-12 lg:gap-24 mb-24 items-start">
            {/* Catchy Serif Headline */}
            <div className="flex-1 max-w-3xl">
              <div className="inline-block border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs font-medium px-3 py-1 rounded-full mb-8 uppercase tracking-widest">
                Engine v2.0
              </div>
              <h2 className="text-5xl md:text-6xl lg:text-[76px] leading-[1.02] text-[var(--text-primary)] font-serif tracking-tight">
                Build smarter, <br />
                <span className="italic text-[var(--text-secondary)]">ship with precision.</span>
              </h2>
            </div>

            {/* Concise Description and GitHub Login Button */}
            <div className="flex-1 max-w-xl lg:mt-12">
              <p className="text-lg md:text-xl text-[var(--text-secondary)] mb-8 leading-relaxed font-sans">
                MagnusCI integrates secure webhook validation, a high-performance DAG parallel execution engine, and serverless Kubernetes runners to produce auditable, deterministic build artifacts.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <button 
                  onClick={initiateGithubLogin}
                  className="anthropic-btn group flex items-center justify-center gap-3 text-base px-6 py-3.5 rounded-lg font-medium w-full sm:w-auto"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="opacity-90">
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
                  </svg>
                  Connect with GitHub
                  <span className="inline-block transition-transform duration-300 group-hover:translate-x-1 ml-1 opacity-70">→</span>
                </button>
                <span className="text-xs text-[var(--text-secondary)] mt-2 sm:mt-0 font-medium tracking-wide">
                  Requires repository access
                </span>
              </div>
            </div>
          </div>

          {}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
            
            {/* Security Card */}
            <div className="anthropic-card p-8 md:p-10 rounded-xl flex flex-col h-full">
              <div className="w-8 h-8 mb-6 text-[var(--text-secondary)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0110 0v4"></path></svg>
              </div>
              <h3 className="text-2xl mb-4 font-serif text-[var(--text-primary)]">Cryptographic Validation</h3>
              <p className="text-[var(--text-secondary)] mb-12 flex-grow leading-relaxed text-sm lg:text-base">
                Secures your CI/CD pipeline using HMAC SHA-256 signatures, ensuring that only authenticated push events from GitHub trigger executions.
              </p>
              <div className="mt-auto pt-6 border-t border-[var(--border-subtle)]">
                <div className="flex justify-between text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-widest">
                  <span>Category</span>
                  <span>Security</span>
                </div>
              </div>
            </div>

            {/* Performance Card */}
            <div className="anthropic-card p-8 md:p-10 rounded-xl flex flex-col h-full">
              <div className="w-8 h-8 mb-6 text-[var(--text-secondary)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
              </div>
              <h3 className="text-2xl mb-4 font-serif text-[var(--text-primary)]">Topological DAG Engine</h3>
              <p className="text-[var(--text-secondary)] mb-12 flex-grow leading-relaxed text-sm lg:text-base">
                Parses complex pipeline dependencies into a Directed Acyclic Graph (DAG), enabling optimal parallel execution of build stages.
              </p>
              <div className="mt-auto pt-6 border-t border-[var(--border-subtle)]">
                <div className="flex justify-between text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-widest">
                  <span>Category</span>
                  <span>Performance</span>
                </div>
              </div>
            </div>

            {/* Infrastructure Card */}
            <div className="anthropic-card p-8 md:p-10 rounded-xl flex flex-col h-full">
              <div className="w-8 h-8 mb-6 text-[var(--text-secondary)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
              </div>
              <h3 className="text-2xl mb-4 font-serif text-[var(--text-primary)]">Serverless Runners</h3>
              <p className="text-[var(--text-secondary)] mb-12 flex-grow leading-relaxed text-sm lg:text-base">
                Dynamically provisions ephemeral Kubernetes Job pods for each build stage. Complete with a global S3 storage cache for blazing fast restoration.
              </p>
              <div className="mt-auto pt-6 border-t border-[var(--border-subtle)]">
                <div className="flex justify-between text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-widest">
                  <span>Category</span>
                  <span>Infrastructure</span>
                </div>
              </div>
            </div>

          </div>
        </main>
        
        {}
        <footer className="w-full border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] pt-16 pb-12 mt-auto z-10">
          <div className="max-w-[1400px] mx-auto px-6">
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-8 lg:gap-12 pb-16 border-b border-[var(--border-subtle)]">
              
              {/* Brand Column */}
              <div className="col-span-2 md:col-span-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-5 h-5 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded-sm flex items-center justify-center">
                      <span className="font-serif font-medium text-xs leading-none">M</span>
                    </div>
                    <span className="text-lg tracking-tight font-serif font-medium text-[var(--text-primary)]">
                      Magnus<span className="italic opacity-70">CI</span>
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-xs mb-6">
                    Ephemeral container-based CI/CD orchestration engine designed for speed, security, and parallel throughput.
                  </p>
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] font-medium">
                  © {new Date().getFullYear()} MagnusCI, Inc.
                </div>
              </div>

              {/* Product Column */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-primary)] mb-4 font-sans">
                  Product
                </h4>
                <ul className="space-y-2.5 text-xs text-[var(--text-secondary)]">
                  <li><a href="#features" className="hover:text-[var(--text-primary)] transition-colors">DAG Engine</a></li>
                  <li><a href="#runners" className="hover:text-[var(--text-primary)] transition-colors">Kubernetes Runners</a></li>
                  <li><a href="#security" className="hover:text-[var(--text-primary)] transition-colors">Webhook Security</a></li>
                  <li><a href="#pricing" className="hover:text-[var(--text-primary)] transition-colors">Pricing</a></li>
                  <li><a href="#changelog" className="hover:text-[var(--text-primary)] transition-colors">Changelog v2.0</a></li>
                </ul>
              </div>

              {/* Resources Column */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-primary)] mb-4 font-sans">
                  Resources
                </h4>
                <ul className="space-y-2.5 text-xs text-[var(--text-secondary)]">
                  <li><a href="#docs" className="hover:text-[var(--text-primary)] transition-colors">Documentation</a></li>
                  <li><a href="#api" className="hover:text-[var(--text-primary)] transition-colors">API Reference</a></li>
                  <li><a href="#guides" className="hover:text-[var(--text-primary)] transition-colors">Integration Guides</a></li>
                  <li><a href="#examples" className="hover:text-[var(--text-primary)] transition-colors">Pipeline Examples</a></li>
                  <li><a href="#status" className="hover:text-[var(--text-primary)] transition-colors">System Status</a></li>
                </ul>
              </div>

              {/* Company Column */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-primary)] mb-4 font-sans">
                  Company
                </h4>
                <ul className="space-y-2.5 text-xs text-[var(--text-secondary)]">
                  <li><a href="#about" className="hover:text-[var(--text-primary)] transition-colors">About</a></li>
                  <li><a href="#blog" className="hover:text-[var(--text-primary)] transition-colors">Research & Blog</a></li>
                  <li><a href="#careers" className="hover:text-[var(--text-primary)] transition-colors">Careers</a></li>
                  <li><a href="#press" className="hover:text-[var(--text-primary)] transition-colors">Press Kit</a></li>
                  <li><a href="#contact" className="hover:text-[var(--text-primary)] transition-colors">Contact Us</a></li>
                </ul>
              </div>

              {/* Legal Column */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-primary)] mb-4 font-sans">
                  Legal
                </h4>
                <ul className="space-y-2.5 text-xs text-[var(--text-secondary)]">
                  <li><a href="#privacy" className="hover:text-[var(--text-primary)] transition-colors">Privacy Policy</a></li>
                  <li><a href="#terms" className="hover:text-[var(--text-primary)] transition-colors">Terms of Service</a></li>
                  <li><a href="#security" className="hover:text-[var(--text-primary)] transition-colors">Security Overview</a></li>
                  <li><a href="#compliance" className="hover:text-[var(--text-primary)] transition-colors">Compliance & SOC 2</a></li>
                  <li><a href="#cookies" className="hover:text-[var(--text-primary)] transition-colors">Cookie Settings</a></li>
                </ul>
              </div>

            </div>

            {/* Bottom Bar */}
            <div className="pt-8 flex flex-col sm:flex-row justify-between items-center text-xs text-[var(--text-secondary)] gap-4 font-medium">
              <p>Built for speed, security, and enterprise-grade scale.</p>
              <div className="flex items-center gap-6">
                <a href="#github" className="hover:text-[var(--text-primary)] transition-colors flex items-center gap-1.5">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                  GitHub
                </a>
                <a href="#twitter" className="hover:text-[var(--text-primary)] transition-colors flex items-center gap-1.5">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  X (Twitter)
                </a>
                <a href="#discord" className="hover:text-[var(--text-primary)] transition-colors flex items-center gap-1.5">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.009c.12.098.245.195.372.288a.077.077 0 0 1-.006.128 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
                  Discord
                </a>
              </div>
            </div>

          </div>
        </footer>
      </div>
    </>
  );
}