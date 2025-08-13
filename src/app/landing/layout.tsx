export const metadata = {
  title: "Laku-Laku | Sell More. Restock Smarter. Power Up Sales.",
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      {children}
    </div>
  );
}
