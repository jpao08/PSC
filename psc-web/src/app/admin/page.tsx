import { redirect } from "next/navigation";
import { getCurrentUser } from "@/infra/current-user";
import { ensureExecutiveAdmin } from "@/core/domain/rules";
import AdminClient from "@/components/AdminClient";

export default async function AdminPage() {
  try {
    const user = await getCurrentUser();
    ensureExecutiveAdmin(user);
    return <AdminClient initialUser={user} />;
  } catch {
    redirect("/dashboard");
  }
}
