import SecurityDashboard from "@/components/admin/SecurityDashboard";
import AdminShell from "@/components/admin/AdminShell";

export const metadata = { title: "安全总览 · 管理后台" };

export default function SecurityPage() {
  return (
    <AdminShell>
      <SecurityDashboard />
    </AdminShell>
  );
}
