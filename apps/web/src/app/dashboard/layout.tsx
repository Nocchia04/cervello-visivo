import Sidebar from "@/components/layout/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <Sidebar />
      <main
        className="min-h-screen"
        style={{
          marginLeft: "var(--sidebar-width)",
          padding: "40px 40px 40px 40px",
        }}
      >
        {children}
      </main>
    </div>
  );
}
