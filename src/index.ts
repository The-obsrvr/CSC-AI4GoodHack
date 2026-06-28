import "dotenv/config";
import { Pipeline } from "../Pipeline.ts";

await new Pipeline().run({ trigger: "manual" });
