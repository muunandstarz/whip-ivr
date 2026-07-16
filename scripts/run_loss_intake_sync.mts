import { runLossIntakeSlackSync } from "../server/lossIntakeSlackSync";

const result = await runLossIntakeSlackSync();
console.log(JSON.stringify(result));
