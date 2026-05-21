import { ChorusSseListener } from "./sse-listener"

export type ChorusSseListenerFactoryArgs = ConstructorParameters<typeof ChorusSseListener>

export function createChorusSseListener(...args: ChorusSseListenerFactoryArgs): ChorusSseListener {
  return new ChorusSseListener(...args)
}
