import { NextRequest } from "next/server";
import { callback } from "@/lib/authRoutes";
export async function GET(req: NextRequest) { return callback(req, "microsoft"); }
