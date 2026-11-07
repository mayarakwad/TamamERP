// A fresh wrapper on every navigation, so each page enters with a short
// fade-and-rise (just a fade when reduced motion is on).
export default function WorkspaceTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
