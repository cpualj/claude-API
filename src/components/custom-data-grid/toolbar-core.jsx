import { usePopover } from 'minimal-shared/hooks';

import Box from '@mui/material/Box';
import Menu from '@mui/material/Menu';
import Badge from '@mui/material/Badge';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Button, { buttonClasses } from '@mui/material/Button';
import {
  ExportCsv,
  ExportPrint,
  QuickFilter,
  ToolbarButton,
  QuickFilterClear,
  useGridApiContext,
  FilterPanelTrigger,
  QuickFilterControl,
  ColumnsPanelTrigger,
} from '@mui/x-data-grid';

import { FilterIcon, ExportIcon, ViewColumnsIcon } from 'src/theme/core/components/mui-x-data-grid';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

export function ToolbarButtonBase({ label, icon, showLabel = true, ...props }) {
  const renderButton = () => (
    <Button
      size="small"
      startIcon={icon}
      sx={{
        ...(showLabel && {
          [`& .${buttonClasses.startIcon}`]: {
            mr: 0.75,
            '& svg': { width: 18, height: 18 },
          },
        }),
      }}
    />
  );

  return (
    <Tooltip title={String(label)}>
      <ToolbarButton {...props} render={showLabel ? renderButton() : undefined}>
        {!showLabel ? icon : String(label)}
      </ToolbarButton>
    </Tooltip>
  );
}
// ----------------------------------------------------------------------

export function CustomToolbarColumnsButton({ showLabel }) {
  const apiRef = useGridApiContext();
  const label = apiRef.current.getLocaleText('toolbarColumns');

  return (
    <ColumnsPanelTrigger
      render={(props) => (
        <ToolbarButtonBase
          {...props}
          label={String(label)}
          icon={<ViewColumnsIcon fontSize="small" />}
          showLabel={showLabel}
        />
      )}
    />
  );
}

// ----------------------------------------------------------------------

export function CustomToolbarFilterButton({ showLabel }) {
  const apiRef = useGridApiContext();
  const label = apiRef.current.getLocaleText('toolbarFilters');

  return (
    <FilterPanelTrigger
      render={(props, state) => (
        <ToolbarButtonBase
          {...props}
          label={String(label)}
          showLabel={showLabel}
          icon={
            <Badge variant="dot" color="error" badgeContent={state.filterCount}>
              <FilterIcon fontSize="small" />
            </Badge>
          }
        />
      )}
    />
  );
}

// ----------------------------------------------------------------------

export function CustomToolbarExportButton({ showLabel }) {
  const apiRef = useGridApiContext();
  const label = apiRef.current.getLocaleText('toolbarExport');
  const csvLabel = apiRef.current.getLocaleText('toolbarExportCSV');
  const printLabel = apiRef.current.getLocaleText('toolbarExportPrint');

  const { open, anchorEl, onClose, onOpen } = usePopover();

  return (
    <>
      <ToolbarButtonBase
        id="export-menu-trigger"
        aria-controls="export-menu"
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        onClick={onOpen}
        label={String(label)}
        icon={<ExportIcon fontSize="small" />}
        showLabel={showLabel}
      />

      <Menu
        id="export-menu"
        open={open}
        anchorEl={anchorEl}
        onClose={onClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          list: {
            'aria-labelledby': 'export-menu-trigger',
          },
        }}
      >
        <ExportPrint render={<MenuItem />} onClick={onClose}>
          {printLabel}
        </ExportPrint>

        <ExportCsv render={<MenuItem />} onClick={onClose}>
          {csvLabel}
        </ExportCsv>
      </Menu>
    </>
  );
}

// ----------------------------------------------------------------------

export function CustomToolbarQuickFilter({ sx, slotProps, ...other }) {
  const apiRef = useGridApiContext();
  const label = apiRef.current.getLocaleText('toolbarQuickFilterLabel');
  const placeholder = apiRef.current.getLocaleText('toolbarQuickFilterPlaceholder');

  return (
    <QuickFilter
      {...other}
      render={(props) => (
        <Box
          {...props}
          sx={[{ width: 1, maxWidth: { md: 260 } }, ...(Array.isArray(sx) ? sx : [sx])]}
        >
          <QuickFilterControl
            render={({ ref, ...controlProps }, state) => (
              <TextField
                {...controlProps}
                fullWidth
                inputRef={ref}
                aria-label={label}
                placeholder={placeholder}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Iconify icon="eva:search-fill" />
                      </InputAdornment>
                    ),
                    endAdornment: state.value ? (
                      <InputAdornment position="end">
                        <QuickFilterClear edge="end" size="small" aria-label="Clear search">
                          <Iconify icon="mingcute:close-line" width={16} />
                        </QuickFilterClear>
                      </InputAdornment>
                    ) : null,
                    ...controlProps.slotProps?.input,
                  },
                  ...controlProps.slotProps,
                  ...slotProps?.textField?.slotProps,
                }}
                {...slotProps?.textField}
              />
            )}
          />
        </Box>
      )}
    />
  );
}
