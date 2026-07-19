import { AdminConsole } from './components/AdminConsole';
import { BuyerApp } from './components/BuyerApp';
import { Login } from './components/Login';
import { ADMIN_USER_ID } from './config';
import { usePersistedState } from './hooks';

// no-password "login": the user id is the whole identity. admin123 lands in the
// admin console, everyone else in the buyer app. the id persists so a refresh
// keeps you signed in (and keeps a buyer's reservation attributable).
export default function App() {
  const [userId, setUserId] = usePersistedState('flash-sale-user', '');
  const logout = () => setUserId('');

  if (!userId) return <Login onLogin={(id) => setUserId(id.trim())} />;

  return userId === ADMIN_USER_ID ? (
    <AdminConsole userId={userId} onLogout={logout} />
  ) : (
    <BuyerApp userId={userId} onLogout={logout} />
  );
}
