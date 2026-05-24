import ConsoleShell from "@/components/console/ConsoleShell";

export const metadata = { title: "控制台" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
