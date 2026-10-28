// Compatibility re-export for existing Aircall imports. The client-safe,
// canonical directory lives in shared/ so document forms can also resolve a
// handler's extension when legacy handler records lack an Aircall user ID.
import {
  AGENT_EXTENSIONS,
  getHandlerExtension,
  HANDLER_EXTENSION_DIRECTORY,
} from "../shared/handlerExtensions";

export {
  AGENT_EXTENSIONS,
  getHandlerExtension,
  HANDLER_EXTENSION_DIRECTORY,
} from "../shared/handlerExtensions";
