import { defineOuraDataTool } from "./tool";
import { registerCli } from "./cli";

export default function ouraclaw(api: any) {
  // Register the oura_data agent tool
  const tool = defineOuraDataTool();
  api.registerTool(tool);

  // Register CLI commands (openclaw ouraclaw setup|status|test)
  registerCli(api);
}
