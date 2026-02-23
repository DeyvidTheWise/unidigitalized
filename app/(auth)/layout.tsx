export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "radial-gradient(circle at 20% 20%, #e0f2fe, #f8fafc 55%)",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 12,
          border: "1px solid #d1d5db",
          background: "#ffffff",
          boxShadow: "0 12px 36px rgba(0,0,0,0.08)",
          padding: 18,
        }}
      >
        {children}
      </div>
    </div>
  );
}
