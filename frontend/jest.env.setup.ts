// Fixture values for VITE_* variables. `babel-plugin-transform-vite-meta-env`
// rewrites `import.meta.env.VITE_X` to `process.env.VITE_X`, so setting these
// here (in `setupFiles`, which runs before the test framework and any test
// module is loaded) gives every test a deterministic, non-empty environment
// without needing a real `.env.test` file.
process.env.VITE_API_URL = 'https://api.checkout.test';
process.env.VITE_PAYMENT_GATEWAY_URL = 'https://gateway.checkout.test';
process.env.VITE_PAYMENT_GATEWAY_PUBLIC_KEY = 'pub_test_0000000000';
