type AuthDecorativeBackgroundProps = {
  variant?: 'light' | 'blue';
};

export function AuthDecorativeBackground({ variant = 'light' }: AuthDecorativeBackgroundProps) {
  if (variant === 'blue') {
    return (
      <>
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="pointer-events-none absolute -right-16 top-16 h-72 w-72 rounded-[2.5rem] bg-white/10" />
        <div className="pointer-events-none absolute -left-10 bottom-24 h-56 w-56 rounded-[2rem] bg-white/10" />
        <div className="pointer-events-none absolute right-24 top-1/3 h-40 w-40 rounded-3xl bg-[#084ba6]/40" />
      </>
    );
  }

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(10,97,215,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(10,97,215,0.045) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      <div className="pointer-events-none absolute -left-28 -top-28 h-80 w-80 rounded-full bg-[#0a61d7]/[0.08] blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-[18%] h-96 w-96 rounded-full bg-[#0a61d7]/[0.06] blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-4rem] left-[20%] h-72 w-72 rounded-[2.5rem] bg-[#084ba6]/[0.07] rotate-12" />
      <div className="pointer-events-none absolute right-[10%] top-[10%] h-44 w-44 rounded-3xl bg-[#0a61d7]/10 animate-showcase-float-slow" />
      <div className="pointer-events-none absolute left-[5%] bottom-[22%] h-32 w-32 rounded-2xl bg-[#084ba6]/10 animate-showcase-float-slower animate-delay-500" />
      <div className="pointer-events-none absolute right-[28%] bottom-[12%] h-24 w-24 rounded-xl border border-[#0a61d7]/10 bg-white/50 shadow-sm animate-showcase-float animate-delay-300" />
      <div className="pointer-events-none absolute left-[38%] top-[8%] h-16 w-16 rounded-full bg-[#0a61d7]/[0.12]" />
    </>
  );
}
