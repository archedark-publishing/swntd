import { workspaceMessage } from "@swntd/shared";
import "./styles.css";

export function App() {
  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Phase 0 Workspace</p>
        <h1>S#!% We Need To Do</h1>
        <p>
          The web app foundation is in place. Product work will layer on top of
          this baseline in later phases.
        </p>
        <code>{workspaceMessage}</code>
      </section>
    </main>
  );
}

export default App;
