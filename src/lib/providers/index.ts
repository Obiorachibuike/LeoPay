import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { MockPaymentProvider } from "./mock";
import { PaystackProvider } from "./paystack";
import type { PaymentProvider, ProviderName } from "./types";

const registry: Record<ProviderName, () => PaymentProvider> = {
  mock: () => new MockPaymentProvider(),
  paystack: () => new PaystackProvider(),
};

export function getProvider(name: ProviderName): PaymentProvider {
  return registry[name]();
}

/** The provider used for new charges in this deployment. */
export function defaultProvider(): PaymentProvider {
  return getProvider(env.paymentProvider as ProviderName);
}

export function providerForName(name: string): PaymentProvider {
  const factory = registry[name as ProviderName];
  if (!factory) throw new AppError("CONFIGURATION_ERROR", `Unknown payment provider: ${name}`);
  return factory();
}

export function providerStatus(): Array<{
  name: ProviderName;
  displayName: string;
  configured: boolean;
  active: boolean;
  capabilities: string[];
}> {
  return (Object.keys(registry) as ProviderName[]).map((name) => {
    const provider = registry[name]();
    const capabilities = Object.entries(provider.capabilities)
      .filter(([, enabled]) => enabled === true)
      .map(([capability]) => capability.replace(/([A-Z])/g, " $1").toLowerCase());
    return {
      name,
      displayName: provider.displayName,
      configured: provider.isConfigured(),
      active: name === env.paymentProvider,
      capabilities,
    };
  });
}

export type { PaymentProvider, ProviderName } from "./types";
