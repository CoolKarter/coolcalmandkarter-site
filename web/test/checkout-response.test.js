import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCheckoutUrl } from '../src/lib/checkout-response.js';

test('accepts a valid https checkout.stripe.com URL', () => {
  const result = extractCheckoutUrl({ url: 'https://checkout.stripe.com/c/pay/cs_test_abc123' });
  assert.equal(result, 'https://checkout.stripe.com/c/pay/cs_test_abc123');
});

test('accepts the bare stripe.com host itself', () => {
  const result = extractCheckoutUrl({ url: 'https://stripe.com/somewhere' });
  assert.equal(result, 'https://stripe.com/somewhere');
});

test('rejects a response with no url field', () => {
  assert.equal(extractCheckoutUrl({}), null);
});

test('rejects a non-object response body', () => {
  assert.equal(extractCheckoutUrl(null), null);
  assert.equal(extractCheckoutUrl(undefined), null);
  assert.equal(extractCheckoutUrl('nope'), null);
  assert.equal(extractCheckoutUrl(['https://checkout.stripe.com/x']), null);
});

test('rejects a non-https URL', () => {
  assert.equal(extractCheckoutUrl({ url: 'http://checkout.stripe.com/c/pay/cs_test_abc123' }), null);
});

test('rejects a URL on an unrelated host, even if https', () => {
  assert.equal(extractCheckoutUrl({ url: 'https://evil.example.com/phishing' }), null);
});

test('rejects a host that merely contains "stripe.com" as a substring', () => {
  assert.equal(extractCheckoutUrl({ url: 'https://stripe.com.evil.example.com/x' }), null);
});

test('rejects a malformed URL string', () => {
  assert.equal(extractCheckoutUrl({ url: 'not a url' }), null);
});

test('rejects an empty or whitespace-only url field', () => {
  assert.equal(extractCheckoutUrl({ url: '' }), null);
  assert.equal(extractCheckoutUrl({ url: '   ' }), null);
});
