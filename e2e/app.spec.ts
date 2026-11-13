import { expect, test } from '@playwright/test';

async function enterPin(page: import('@playwright/test').Page, pin: string): Promise<void> {
  for (const digit of pin) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Desbloquear' }).click();
}

test('creates, searches, autosaves, edits, reloads, and deletes a protected diary entry', async ({ page }) => {
  await page.goto('/');
  const cryptoContext = await page.evaluate(() => ({
    secure: window.isSecureContext,
    subtleAvailable: window.crypto?.subtle !== undefined,
  }));
  expect(cryptoContext.secure).toBe(true);
  expect(cryptoContext.subtleAvailable).toBe(true);
  await expect(page.getByRole('heading', { name: 'Crie seu PIN' })).toBeVisible();

  for (const digit of '2468') {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Continuar' }).click();
  for (const digit of '2468') {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Confirmar PIN' }).click();
  await expect(page.getByRole('heading', { name: 'Meu diário' })).toBeVisible();

  await page.getByRole('button', { name: 'Nova anotação' }).click();
  await page.locator('ion-input input').fill('Primeiro registro');
  await page.locator('ion-textarea textarea').fill('Lembrar de cuidar de mim.');
  await page.getByRole('button', { name: 'Voltar ao histórico' }).click();
  await expect(page.getByRole('heading', { name: 'Primeiro registro' })).toBeVisible();

  await page.locator('ion-searchbar input').fill('cuidar');
  await expect(page.getByRole('heading', { name: 'Primeiro registro' })).toBeVisible();
  await page.locator('ion-searchbar input').fill('');
  await page.getByRole('heading', { name: 'Primeiro registro' }).click();
  await page.locator('ion-textarea textarea').fill('Uma tarde tranquila para cuidar de mim.');
  await page.getByRole('button', { name: 'Voltar ao histórico' }).click();

  await page.reload();
  await enterPin(page, '2468');
  await expect(page.getByRole('heading', { name: 'Primeiro registro' })).toBeVisible();
  await expect(page.getByText(/Uma tarde tranquila/)).toBeVisible();

  await page.getByRole('button', { name: 'Excluir anotação' }).click();
  await page.getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Seu diário começa aqui' })).toBeVisible();
});
