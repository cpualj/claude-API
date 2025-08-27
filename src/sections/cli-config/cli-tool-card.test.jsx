import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CLIToolCard from './cli-tool-card';

describe('CLIToolCard', () => {
  const mockTool = {
    id: 'claude',
    name: 'Claude Code',
    command: 'claude',
    description: 'Claude AI CLI tool',
    enabled: true,
    auth: {
      type: 'file',
      required: true,
      authFile: '~/.claude/auth.json',
    },
    session: {
      supported: true,
      persistProcess: false,
    },
    execution: {
      type: 'spawn',
      timeout: 30000,
    },
  };

  const mockHandlers = {
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggle: vi.fn(),
    onValidate: vi.fn(),
  };

  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Display', () => {
    it('should render tool information', () => {
      render(<CLIToolCard tool={mockTool} {...mockHandlers} />);

      expect(screen.getByText('Claude Code')).toBeInTheDocument();
      expect(screen.getByText('claude')).toBeInTheDocument();
      expect(screen.getByText('Claude AI CLI tool')).toBeInTheDocument();
    });

    it('should show enabled status', () => {
      render(<CLIToolCard tool={mockTool} {...mockHandlers} />);

      const statusBadge = screen.getByTestId('status-badge');
      expect(statusBadge).toHaveTextContent('Enabled');
      expect(statusBadge).toHaveClass('badge-success');
    });

    it('should show disabled status', () => {
      const disabledTool = { ...mockTool, enabled: false };
      render(<CLIToolCard tool={disabledTool} {...mockHandlers} />);

      const statusBadge = screen.getByTestId('status-badge');
      expect(statusBadge).toHaveTextContent('Disabled');
      expect(statusBadge).toHaveClass('badge-error');
    });

    it('should show authentication type', () => {
      render(<CLIToolCard tool={mockTool} {...mockHandlers} />);

      expect(screen.getByText('Auth: File')).toBeInTheDocument();
      expect(screen.getByTestId('auth-icon')).toHaveClass('icon-lock');
    });

    it('should show no auth required', () => {
      const noAuthTool = { 
        ...mockTool, 
        auth: { type: 'none', required: false } 
      };
      render(<CLIToolCard tool={noAuthTool} {...mockHandlers} />);

      expect(screen.getByText('No Auth')).toBeInTheDocument();
      expect(screen.getByTestId('auth-icon')).toHaveClass('icon-unlock');
    });

    it('should show session support', () => {
      render(<CLIToolCard tool={mockTool} {...mockHandlers} />);

      expect(screen.getByTestId('session-icon')).toBeInTheDocument();
      expect(screen.getByText('Sessions')).toBeInTheDocument();
    });

    it('should not show session icon when not supported', () => {
      const noSessionTool = { 
        ...mockTool, 
        session: { supported: false } 
      };
      render(<CLIToolCard tool={noSessionTool} {...mockHandlers} />);

      expect(screen.queryByTestId('session-icon')).not.toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    it('should call onEdit when edit button clicked', async () => {
      render(<CLIToolCard tool={mockTool} {...mockHandlers} />);

      const editButton = screen.getByLabelText('Edit tool');
      await user.click(editButton);

      expect(mockHandlers.onEdit).toHaveBeenCalledWith(mockTool);
    });

    it('should call onDelete when delete button clicked', async () => {
      render(<CLIToolCard tool={mockTool} {...mockHandlers} />);

      const deleteButton = screen.getByLabelText('Delete tool');
      await user.click(deleteButton);

      expect(mockHandlers.onDelete).toHaveBeenCalledWith(mockTool);
    });

    it('should call onToggle when toggle button clicked', async () => {
      render(<CLIToolCard tool={mockTool} {...mockHandlers} />);

      const toggleButton = screen.getByLabelText('Disable tool');
      await user.click(toggleButton);

      expect(mockHandlers.onToggle).toHaveBeenCalledWith(mockTool);
    });

    it('should show correct toggle button text when disabled', () => {
      const disabledTool = { ...mockTool, enabled: false };
      render(<CLIToolCard tool={disabledTool} {...mockHandlers} />);

      expect(screen.getByLabelText('Enable tool')).toBeInTheDocument();
    });

    it('should call onValidate when validate button clicked', async () => {
      render(<CLIToolCard tool={mockTool} {...mockHandlers} />);

      const validateButton = screen.getByLabelText('Validate tool');
      await user.click(validateButton);

      expect(mockHandlers.onValidate).toHaveBeenCalledWith(mockTool);
    });
  });

  describe('Expanded View', () => {
    it('should expand to show more details', async () => {
      render(<CLIToolCard tool={mockTool} {...mockHandlers} />);

      const expandButton = screen.getByLabelText('Show more');
      await user.click(expandButton);

      expect(screen.getByText('Execution')).toBeInTheDocument();
      expect(screen.getByText('Type: spawn')).toBeInTheDocument();
      expect(screen.getByText('Timeout: 30s')).toBeInTheDocument();
    });

    it('should collapse details', async () => {
      render(<CLIToolCard tool={mockTool} {...mockHandlers} />);

      const expandButton = screen.getByLabelText('Show more');
      await user.click(expandButton);
      
      expect(screen.getByText('Execution')).toBeInTheDocument();

      const collapseButton = screen.getByLabelText('Show less');
      await user.click(collapseButton);

      expect(screen.queryByText('Execution')).not.toBeInTheDocument();
    });

    it('should show authentication details when expanded', async () => {
      render(<CLIToolCard tool={mockTool} {...mockHandlers} />);

      await user.click(screen.getByLabelText('Show more'));

      expect(screen.getByText('Authentication')).toBeInTheDocument();
      expect(screen.getByText('Type: file')).toBeInTheDocument();
      expect(screen.getByText('File: ~/.claude/auth.json')).toBeInTheDocument();
    });

    it('should show session details when expanded', async () => {
      render(<CLIToolCard tool={mockTool} {...mockHandlers} />);

      await user.click(screen.getByLabelText('Show more'));

      expect(screen.getByText('Session')).toBeInTheDocument();
      expect(screen.getByText('Supported: Yes')).toBeInTheDocument();
      expect(screen.getByText('Persist Process: No')).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('should show loading state during actions', async () => {
      const slowHandler = vi.fn(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );
      
      render(
        <CLIToolCard 
          tool={mockTool} 
          {...mockHandlers}
          onValidate={slowHandler}
        />
      );

      const validateButton = screen.getByLabelText('Validate tool');
      await user.click(validateButton);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('should disable buttons during loading', async () => {
      const slowHandler = vi.fn(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );
      
      render(
        <CLIToolCard 
          tool={mockTool} 
          {...mockHandlers}
          onDelete={slowHandler}
        />
      );

      const deleteButton = screen.getByLabelText('Delete tool');
      await user.click(deleteButton);

      expect(screen.getByLabelText('Edit tool')).toBeDisabled();
      expect(screen.getByLabelText('Delete tool')).toBeDisabled();
      expect(screen.getByLabelText('Disable tool')).toBeDisabled();
    });
  });

  describe('Special Cases', () => {
    it('should handle tool without description', () => {
      const noDescTool = { ...mockTool, description: undefined };
      render(<CLIToolCard tool={noDescTool} {...mockHandlers} />);

      expect(screen.getByText('No description')).toBeInTheDocument();
    });

    it('should handle OAuth authentication type', () => {
      const oauthTool = {
        ...mockTool,
        auth: {
          type: 'oauth',
          required: true,
          authUrl: 'https://auth.example.com',
        },
      };
      render(<CLIToolCard tool={oauthTool} {...mockHandlers} />);

      expect(screen.getByText('Auth: OAuth')).toBeInTheDocument();
    });

    it('should handle environment variable authentication', () => {
      const envTool = {
        ...mockTool,
        auth: {
          type: 'env',
          required: true,
          envVars: ['API_KEY', 'API_SECRET'],
        },
      };
      render(<CLIToolCard tool={envTool} {...mockHandlers} />);

      expect(screen.getByText('Auth: Environment')).toBeInTheDocument();
    });

    it('should show persistent process icon', () => {
      const persistTool = {
        ...mockTool,
        session: {
          supported: true,
          persistProcess: true,
        },
      };
      render(<CLIToolCard tool={persistTool} {...mockHandlers} />);

      expect(screen.getByTestId('persist-icon')).toBeInTheDocument();
      expect(screen.getByText('Persistent')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should show error state on action failure', async () => {
      const errorHandler = vi.fn().mockRejectedValueOnce(
        new Error('Validation failed')
      );
      
      render(
        <CLIToolCard 
          tool={mockTool} 
          {...mockHandlers}
          onValidate={errorHandler}
        />
      );

      const validateButton = screen.getByLabelText('Validate tool');
      await user.click(validateButton);

      await screen.findByText('Validation failed');
    });

    it('should recover from error state', async () => {
      const errorHandler = vi.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce({ success: true });
      
      render(
        <CLIToolCard 
          tool={mockTool} 
          {...mockHandlers}
          onValidate={errorHandler}
        />
      );

      const validateButton = screen.getByLabelText('Validate tool');
      
      // First click - error
      await user.click(validateButton);
      await screen.findByText('First failure');

      // Second click - success
      await user.click(validateButton);
      expect(screen.queryByText('First failure')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<CLIToolCard tool={mockTool} {...mockHandlers} />);

      expect(screen.getByRole('article')).toHaveAttribute(
        'aria-label',
        'Claude Code CLI tool'
      );
    });

    it('should support keyboard navigation', async () => {
      render(<CLIToolCard tool={mockTool} {...mockHandlers} />);

      const card = screen.getByRole('article');
      card.focus();

      // Tab through interactive elements
      await userEvent.tab();
      expect(screen.getByLabelText('Show more')).toHaveFocus();

      await userEvent.tab();
      expect(screen.getByLabelText('Edit tool')).toHaveFocus();

      await userEvent.tab();
      expect(screen.getByLabelText('Delete tool')).toHaveFocus();
    });

    it('should announce status changes', async () => {
      const { rerender } = render(
        <CLIToolCard tool={mockTool} {...mockHandlers} />
      );

      expect(screen.getByRole('status')).toHaveTextContent('Enabled');

      const disabledTool = { ...mockTool, enabled: false };
      rerender(<CLIToolCard tool={disabledTool} {...mockHandlers} />);

      expect(screen.getByRole('status')).toHaveTextContent('Disabled');
    });
  });
});