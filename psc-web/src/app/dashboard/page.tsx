import { redirect } from "next/navigation";
import { getCurrentUser } from "@/infra/current-user";
import DashboardClient from "@/components/DashboardClient";

export default async function DashboardPage() {
  try {
    const user = await getCurrentUser();
    return <DashboardClient initialUser={user} />;
  } catch {
    redirect("/login");
  }
}
