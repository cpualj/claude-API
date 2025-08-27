import { useState, useCallback } from 'react';
import { varAlpha } from 'minimal-shared/utils';

import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import { Toolbar } from '@mui/x-data-grid';
import { styled } from '@mui/material/styles';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import OutlinedInput from '@mui/material/OutlinedInput';

import { Iconify } from 'src/components/iconify';
import {
  CustomToolbarQuickFilter,
  CustomToolbarExportButton,
  CustomToolbarFilterButton,
  CustomToolbarColumnsButton,
  CustomToolbarSettingsButton,
} from 'src/components/custom-data-grid';

import { ProductTableFiltersResult } from './product-table-filters-result';

// ----------------------------------------------------------------------

export function ProductTableToolbar({
  options,
  filters,
  canReset,
  filteredResults,
  selectedRowCount,
  onOpenConfirmDeleteRows,

  /********/
  settings,

  onChangeSettings,
}) {
  const { state: currentFilters, setState: updateFilters } = filters;

  const [stock, setStock] = useState(currentFilters.stock || []);
  const [publish, setPublish] = useState(currentFilters.publish || []);

  const handleSelect = useCallback(
    (setter) => (event) => {
      const value = event.target.value;
      const parsedValue = typeof value === 'string' ? value.split(',') : value;

      setter(parsedValue);
    },
    []
  );

  const renderLeftPanel = () => (
    <ToolbarLeftPanel>
      <FilterSelect
        label="Stock"
        value={stock}
        options={options.stocks}
        onChange={handleSelect(setStock)}
        onApply={() => updateFilters({ stock })}
      />

      <FilterSelect
        label="Publish"
        value={publish}
        options={options.publishs}
        onChange={handleSelect(setPublish)}
        onApply={() => updateFilters({ publish })}
      />

      <CustomToolbarQuickFilter />
    </ToolbarLeftPanel>
  );

  const renderRightPanel = () => (
    <ToolbarRightPanel>
      {!!selectedRowCount && (
        <Button
          size="small"
          color="error"
          startIcon={<Iconify icon="solar:trash-bin-trash-bold" />}
          onClick={onOpenConfirmDeleteRows}
        >
          Delete ({selectedRowCount})
        </Button>
      )}

      <CustomToolbarColumnsButton />
      <CustomToolbarFilterButton />
      <CustomToolbarExportButton />
      <CustomToolbarSettingsButton settings={settings} onChangeSettings={onChangeSettings} />
    </ToolbarRightPanel>
  );

  return (
    <>
      <Toolbar>
        <ToolbarContainer>
          {renderLeftPanel()}
          {renderRightPanel()}
        </ToolbarContainer>
      </Toolbar>

      {canReset && (
        <ProductTableFiltersResult
          filters={filters}
          totalResults={filteredResults}
          sx={{ p: 2.5, pt: 0 }}
        />
      )}
    </>
  );
}

// ----------------------------------------------------------------------

function FilterSelect({ label, value, options, onChange, onApply }) {
  const id = `filter-${label.toLowerCase()}-select`;

  return (
    <FormControl sx={{ flexShrink: 0, width: { xs: 1, md: 200 } }}>
      <InputLabel htmlFor={id}>{label}</InputLabel>
      <Select
        multiple
        value={value}
        onChange={onChange}
        onClose={onApply}
        input={<OutlinedInput label={label} />}
        renderValue={(selected) => {
          const output = options
            .filter((opt) => selected.includes(opt.value))
            .map((opt) => opt.label);

          return output.join(', ');
        }}
        inputProps={{ id }}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            <Checkbox
              disableRipple
              size="small"
              checked={value.includes(option.value)}
              slotProps={{
                input: {
                  id: `${option.value}-checkbox`,
                  'aria-label': `${option.label} checkbox`,
                },
              }}
            />
            {option.label}
          </MenuItem>
        ))}

        <MenuItem
          onClick={onApply}
          sx={(theme) => ({
            justifyContent: 'center',
            fontWeight: theme.typography.button,
            bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.08),
            border: `solid 1px ${varAlpha(theme.vars.palette.grey['500Channel'], 0.16)}`,
          })}
        >
          Apply
        </MenuItem>
      </Select>
    </FormControl>
  );
}

// ----------------------------------------------------------------------

const ToolbarContainer = styled('div')(({ theme }) => ({
  width: '100%',
  display: 'flex',
  flexWrap: 'wrap',
  flexDirection: 'column',
  gap: theme.spacing(2),
  [theme.breakpoints.up('md')]: {
    alignItems: 'center',
    flexDirection: 'row',
  },
}));

const ToolbarLeftPanel = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(2),
  [theme.breakpoints.up('md')]: {
    flexDirection: 'row',
  },
}));

const ToolbarRightPanel = styled('div')(({ theme }) => ({
  flexGrow: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: theme.spacing(1),
}));
