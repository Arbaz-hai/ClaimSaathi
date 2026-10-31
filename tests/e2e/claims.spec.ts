import { expect, test } from '@playwright/test';

test('one demo moves from a missing document through hospital and human approval', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start the demo' }).click();
  await expect(page).toHaveURL(/\/claims\/.+demo=1&role=customer/);

  await page.getByRole('button', { name: 'Ask about my claim' }).click();
  await expect(page.getByText(/missing required document is Discharge summary/i)).toBeVisible();
  await expect(page.getByText('The policy, hospital bill, and payment receipt are already in this fictional claim.')).toBeVisible();

  const caseId = /\/claims\/([^?]+)/.exec(page.url())?.[1];
  expect(caseId).toBeTruthy();
  const sampleResponse = await page.request.get(new URL(`/api/claims/${caseId}/sample-discharge`, page.url()).toString());
  expect(sampleResponse.ok()).toBeTruthy();
  expect(sampleResponse.headers()['content-type']).toContain('application/pdf');
  await page.locator('#demo-discharge').setInputFiles({
    name: 'demo-discharge-summary.pdf',
    mimeType: 'application/pdf',
    buffer: await sampleResponse.body(),
  });
  await page.getByRole('button', { name: 'Upload discharge summary' }).click();
  await expect(page.getByText('Missing discharge summary received and document checks refreshed.')).toBeVisible();
  await page.getByRole('button', { name: 'Share packet with demo reviewers' }).click();

  await page.getByRole('button', { name: 'Hospital', exact: true }).click();
  await expect(page.getByText('A demo packet is ready for review.')).toBeVisible();
  await page.getByRole('button', { name: 'Verify sample document received' }).click();

  await page.getByRole('button', { name: 'Human claims reviewer' }).click();
  await page.getByRole('button', { name: 'Human review: approve and send to simulated insurer' }).click();
  await expect(page.getByText('Simulated insurer acknowledgement received after human review. It is not a real decision.')).toBeVisible();
  await page.getByRole('button', { name: 'Show simulated approval and payout' }).click();

  await page.getByRole('button', { name: 'Customer', exact: true }).click();
  await expect(page.getByText('₹80,000 shown as credited')).toBeVisible();
  await expect(page.getByText(/No payment was made/i)).toBeVisible();
});

test('role steps reject out-of-order review and premature payout', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start the demo' }).click();
  await expect(page).toHaveURL(/\/claims\/.+demo=1/);
  const caseId = /\/claims\/([^?]+)/.exec(page.url())?.[1];
  expect(caseId).toBeTruthy();

  const prematureHospitalReview = await page.request.post('/api/demo/role-step', { data: { caseId, step: 'HOSPITAL_VERIFY' } });
  expect(prematureHospitalReview.ok()).toBeFalsy();
  const prematurePayout = await page.request.post('/api/demo/role-step', { data: { caseId, step: 'PAYOUT_CONFIRM' } });
  expect(prematurePayout.ok()).toBeFalsy();
});
