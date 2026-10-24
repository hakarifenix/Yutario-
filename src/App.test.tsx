import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HashRouter } from 'react-router-dom';
import App from './App';

function renderApp() {
  return render(
    <HashRouter>
      <App />
    </HashRouter>,
  );
}

describe('application shell', () => {
  it('boots into the home screen with navigation chrome', async () => {
    renderApp();
    await waitFor(() => {
      expect(
        screen.getByText(/Good (morning|afternoon|evening)|Bonjour|Bon après-midi|Bonsoir|صباح الخير|طاب نهارك|مساء الخير/),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByText('Yutario')).toBeInTheDocument();
  });

  it('navigates to the music library and settings', async () => {
    renderApp();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument());

    await user.click(screen.getAllByRole('link')[1]);
    await waitFor(() => expect(screen.getByPlaceholderText(/Search title|Rechercher|ابحث/)).toBeInTheDocument());

    await user.click(screen.getAllByRole('link')[4]);
    await waitFor(() => expect(screen.getByText(/Resume where I left off|Reprendre là où|المتابعة من حيث/)).toBeInTheDocument());
  });
});
