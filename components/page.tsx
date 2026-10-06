/** Page frame for the store's back office: title and one line of purpose on the left, actions on the right. */
export function Page({
  title,
  intro,
  actions,
  children,
}: {
  title: string;
  intro?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-[1400px] mx-auto px-5 lg:px-10 py-6 lg:py-9 flex flex-col gap-7">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex-1 min-w-64">
          <h1 className="text-3xl lg:text-4xl">{title}</h1>
          {intro && <p className="text-lg text-muted mt-1.5 max-w-[65ch]">{intro}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
