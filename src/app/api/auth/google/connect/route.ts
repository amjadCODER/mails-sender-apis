import { connect } from "@/lib/authRoutes";
export async function GET() { return connect("google"); }
