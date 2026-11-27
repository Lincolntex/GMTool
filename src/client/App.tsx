import { Link, Route, Routes } from 'react-router-dom';
import { CampaignBuilderPage } from './pages/CampaignBuilderPage';
import { GmPage } from './pages/GmPage';
import { GmSessionPage } from './pages/GmSessionPage';
import { JoinPage } from './pages/JoinPage';
import { SessionPage } from './pages/SessionPage';

function LandingPage() {
  return (
    <main className="landing">
      <div className="landing-card landing-card-centered">
        <h1 className="landing-title">
          GMTOOL <span>ALPHA</span>
        </h1>
        <p className="landing-subtitle">Welcome to your Session management tool</p>
        <Link className="button primary landing-button" to="/gm">
          Set a Scene
        </Link>
      </div>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="landing">
      <div className="landing-card">
        <span className="eyebrow">Not found</span>
        <h1>That page does not exist.</h1>
        <Link className="button primary" to="/">
          Return home
        </Link>
      </div>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/gm" element={<GmPage />} />
      <Route path="/gm/campaigns/new" element={<CampaignBuilderPage />} />
      <Route path="/gm/campaigns/:campaignId/edit" element={<CampaignBuilderPage />} />
      <Route path="/gm/session" element={<GmSessionPage />} />
      <Route path="/join/:roomId" element={<JoinPage />} />
      <Route path="/session/:roomId" element={<SessionPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
