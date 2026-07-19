export function Header({
  userId,
  onLogout,
}: {
  userId: string;
  onLogout: () => void;
}) {
  return (
    <header className="topbar">
      <h1>Flash Sale</h1>
      <div className="who">
        <span className="muted">
          signed in as <strong>{userId}</strong>
        </span>
        <button className="linkbtn" onClick={onLogout}>
          log out
        </button>
      </div>
    </header>
  );
}
