import userEvent from '@testing-library/user-event';
import { it, vi, expect, describe, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

import CLIConfigList from './cli-config-list';
import { fetchCLITools, deleteCLITool } from '../../api/cli-tools';

// Mock API functions
vi.mock('../../api/cli-tools', () => ({
  fetchCLITools: vi.fn(),
  deleteCLITool: vi.fn(),
}));

// Mock child components
vi.mock('./cli-config-form', () => ({
  default: ({ tool, onClose, onSave }) => (
    <div data-testid="cli-config-form">
      <button onClick={() => onSave({ ...tool, name: 'Updated' })}>
        Save
      </button>
      <button onClick={onClose}>Cancel</button>
    </div>
  ),
}));

vi.mock('./cli-tool-card', () => ({
  default: ({ tool, onEdit, onDelete, onToggle }) => (
    <div data-testid={`tool-card-${tool.id}`}>
      <span>{tool.name}</span>
      <button onClick={() => onEdit(tool)}>Edit</button>
      <button onClick={() => onDelete(tool)}>Delete</button>
      <button onClick={() => onToggle(tool)}>
        {tool.enabled ? 'Disable' : 'Enable'}
      </button>
    </div>
  ),
}));

describe('CLIConfigList', () => {
  let queryClient;
  const user = userEvent.setup();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  const renderComponent = () => render(
      <QueryClientProvider client={queryClient}>
        <CLIConfigList />
      </QueryClientProvider>
    );

  describe('Loading and Display', () => {
    it('should show loading state initially', () => {
      fetchCLITools.mockImplementation(() => 
        new Promise(() => {}) // Never resolves
      );

      renderComponent();
      
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('should display CLI tools when loaded', async () => {
      const mockTools = [
        {
          id: 'claude',
          name: 'Claude Code',
          command: 'claude',
          enabled: true,
        },
        {
          id: 'openai',
          name: 'OpenAI CLI',
          command: 'openai',
          enabled: false,
        },
      ];

      fetchCLITools.mockResolvedValueOnce(mockTools);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
        expect(screen.getByText('OpenAI CLI')).toBeInTheDocument();
      });

      expect(screen.getAllByTestId(/^tool-card-/)).toHaveLength(2);
    });

    it('should show error state on fetch failure', async () => {
      fetchCLITools.mockRejectedValueOnce(new Error('Network error'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/Failed to load CLI tools/i)).toBeInTheDocument();
      });

      // Should show retry button
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('should show empty state when no tools', async () => {
      fetchCLITools.mockResolvedValueOnce([]);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/No CLI tools configured/i)).toBeInTheDocument();
      });
    });
  });

  describe('Search and Filter', () => {
    const mockTools = [
      { id: 'claude', name: 'Claude Code', enabled: true },
      { id: 'openai', name: 'OpenAI CLI', enabled: true },
      { id: 'gemini', name: 'Gemini', enabled: false },
    ];

    beforeEach(() => {
      fetchCLITools.mockResolvedValueOnce(mockTools);
    });

    it('should filter tools by search term', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search tools/i);
      await user.type(searchInput, 'claude');

      expect(screen.getByTestId('tool-card-claude')).toBeInTheDocument();
      expect(screen.queryByTestId('tool-card-openai')).not.toBeInTheDocument();
      expect(screen.queryByTestId('tool-card-gemini')).not.toBeInTheDocument();
    });

    it('should filter by enabled status', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByTestId(/^tool-card-/)).toHaveLength(3);
      });

      const filterSelect = screen.getByLabelText(/Filter by status/i);
      fireEvent.change(filterSelect, { target: { value: 'enabled' } });

      expect(screen.getByTestId('tool-card-claude')).toBeInTheDocument();
      expect(screen.getByTestId('tool-card-openai')).toBeInTheDocument();
      expect(screen.queryByTestId('tool-card-gemini')).not.toBeInTheDocument();
    });

    it('should combine search and filter', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByTestId(/^tool-card-/)).toHaveLength(3);
      });

      // Search for 'ai' and filter by enabled
      const searchInput = screen.getByPlaceholderText(/Search tools/i);
      await user.type(searchInput, 'ai');

      const filterSelect = screen.getByLabelText(/Filter by status/i);
      fireEvent.change(filterSelect, { target: { value: 'enabled' } });

      // Only OpenAI CLI should match (contains 'ai' and is enabled)
      expect(screen.getByTestId('tool-card-openai')).toBeInTheDocument();
      expect(screen.queryByTestId('tool-card-claude')).not.toBeInTheDocument();
      expect(screen.queryByTestId('tool-card-gemini')).not.toBeInTheDocument();
    });
  });

  describe('Add Tool', () => {
    beforeEach(() => {
      fetchCLITools.mockResolvedValueOnce([]);
    });

    it('should open add tool dialog', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Add Tool')).toBeInTheDocument();
      });

      const addButton = screen.getByText('Add Tool');
      await user.click(addButton);

      expect(screen.getByTestId('cli-config-form')).toBeInTheDocument();
    });

    it('should close dialog on cancel', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Add Tool')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Add Tool'));
      expect(screen.getByTestId('cli-config-form')).toBeInTheDocument();

      await user.click(screen.getByText('Cancel'));
      expect(screen.queryByTestId('cli-config-form')).not.toBeInTheDocument();
    });

    it('should refresh list after adding tool', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Add Tool')).toBeInTheDocument();
      });

      // Mock the second fetch after adding
      fetchCLITools.mockResolvedValueOnce([
        { id: 'new-tool', name: 'New Tool', enabled: true },
      ]);

      await user.click(screen.getByText('Add Tool'));
      await user.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(screen.getByText('New Tool')).toBeInTheDocument();
      });

      expect(fetchCLITools).toHaveBeenCalledTimes(2);
    });
  });

  describe('Edit Tool', () => {
    const mockTools = [
      { id: 'claude', name: 'Claude Code', enabled: true },
    ];

    beforeEach(() => {
      fetchCLITools.mockResolvedValueOnce(mockTools);
    });

    it('should open edit dialog when edit button clicked', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Edit'));

      expect(screen.getByTestId('cli-config-form')).toBeInTheDocument();
    });

    it('should update tool after editing', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });

      // Mock updated fetch
      fetchCLITools.mockResolvedValueOnce([
        { id: 'claude', name: 'Updated', enabled: true },
      ]);

      await user.click(screen.getByText('Edit'));
      await user.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(screen.getByText('Updated')).toBeInTheDocument();
      });

      expect(fetchCLITools).toHaveBeenCalledTimes(2);
    });
  });

  describe('Delete Tool', () => {
    const mockTools = [
      { id: 'claude', name: 'Claude Code', enabled: true },
      { id: 'openai', name: 'OpenAI CLI', enabled: false },
    ];

    beforeEach(() => {
      fetchCLITools.mockResolvedValueOnce(mockTools);
    });

    it('should show confirmation dialog on delete', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('Delete');
      await user.click(deleteButtons[0]);

      expect(screen.getByText(/Are you sure/i)).toBeInTheDocument();
      expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
    });

    it('should delete tool on confirmation', async () => {
      deleteCLITool.mockResolvedValueOnce({ success: true });
      
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });

      // Mock fetch after deletion
      fetchCLITools.mockResolvedValueOnce([mockTools[1]]);

      const deleteButtons = screen.getAllByText('Delete');
      await user.click(deleteButtons[0]);
      await user.click(screen.getByText('Confirm Delete'));

      await waitFor(() => {
        expect(screen.queryByText('Claude Code')).not.toBeInTheDocument();
        expect(screen.getByText('OpenAI CLI')).toBeInTheDocument();
      });

      expect(deleteCLITool).toHaveBeenCalledWith('claude');
    });

    it('should cancel deletion', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('Delete');
      await user.click(deleteButtons[0]);
      
      await user.click(screen.getByText('Cancel'));

      // Tool should still be present
      expect(screen.getByText('Claude Code')).toBeInTheDocument();
      expect(deleteCLITool).not.toHaveBeenCalled();
    });

    it('should show error on deletion failure', async () => {
      deleteCLITool.mockRejectedValueOnce(new Error('Cannot delete active tool'));
      
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('Delete');
      await user.click(deleteButtons[0]);
      await user.click(screen.getByText('Confirm Delete'));

      await waitFor(() => {
        expect(screen.getByText(/Failed to delete/i)).toBeInTheDocument();
      });

      // Tool should still be present
      expect(screen.getByText('Claude Code')).toBeInTheDocument();
    });
  });

  describe('Toggle Tool', () => {
    const mockTools = [
      { id: 'claude', name: 'Claude Code', enabled: true },
    ];

    beforeEach(() => {
      fetchCLITools.mockResolvedValueOnce(mockTools);
    });

    it('should toggle tool enabled status', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });

      // Mock fetch with toggled status
      fetchCLITools.mockResolvedValueOnce([
        { id: 'claude', name: 'Claude Code', enabled: false },
      ]);

      await user.click(screen.getByText('Disable'));

      await waitFor(() => {
        expect(screen.getByText('Enable')).toBeInTheDocument();
      });

      expect(fetchCLITools).toHaveBeenCalledTimes(2);
    });
  });

  describe('Sorting', () => {
    const mockTools = [
      { id: 'claude', name: 'Claude Code', enabled: true },
      { id: 'openai', name: 'OpenAI CLI', enabled: false },
      { id: 'gemini', name: 'Gemini', enabled: true },
    ];

    beforeEach(() => {
      fetchCLITools.mockResolvedValueOnce(mockTools);
    });

    it('should sort tools by name', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByTestId(/^tool-card-/)).toHaveLength(3);
      });

      const sortSelect = screen.getByLabelText(/Sort by/i);
      fireEvent.change(sortSelect, { target: { value: 'name' } });

      const cards = screen.getAllByTestId(/^tool-card-/);
      expect(cards[0]).toHaveAttribute('data-testid', 'tool-card-claude');
      expect(cards[1]).toHaveAttribute('data-testid', 'tool-card-gemini');
      expect(cards[2]).toHaveAttribute('data-testid', 'tool-card-openai');
    });

    it('should sort tools by status', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByTestId(/^tool-card-/)).toHaveLength(3);
      });

      const sortSelect = screen.getByLabelText(/Sort by/i);
      fireEvent.change(sortSelect, { target: { value: 'status' } });

      const cards = screen.getAllByTestId(/^tool-card-/);
      // Enabled tools first
      expect(cards[0]).toHaveAttribute('data-testid', 'tool-card-claude');
      expect(cards[1]).toHaveAttribute('data-testid', 'tool-card-gemini');
      expect(cards[2]).toHaveAttribute('data-testid', 'tool-card-openai');
    });
  });
});