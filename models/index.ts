/**
 * Registers every model on the shared mongoose instance.
 *
 * `populate()` resolves a ref by looking the model name up on mongoose, so a
 * route that populates `buildingId` fails with MissingSchemaError unless
 * Building's module has been evaluated — even though the route never touches
 * the model directly. Importing this barrel from `lib/db` means any handler
 * that calls `connect()` has all schemas registered, instead of each route
 * having to remember the transitive set of models its populates depend on.
 */
export { default as Building } from "./Building";
export { default as Complaint } from "./Complaint";
export { default as EmailVerification } from "./EmailVerification";
export { default as Floor } from "./Floor";
export { default as Notification } from "./Notification";
export { default as Room } from "./Room";
export { default as User } from "./User";
