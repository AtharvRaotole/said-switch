import { useLiveState } from './api/useLiveState';
import { Console } from './components/Console';
import { useFixturePlayer } from './fixtures/useFixturePlayer';

export function App() {
  const fixture = new URLSearchParams(window.location.search).get('fixture');
  return fixture === 'dark-mode' ? <FixtureConsole /> : <LiveConsole />;
}

function LiveConsole() {
  const data = useLiveState();
  return <Console data={data} />;
}

function FixtureConsole() {
  const player = useFixturePlayer();
  return <Console data={player.data} player={player} />;
}
