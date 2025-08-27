import { Fragment, useCallback } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';

import { Iconify } from 'src/components/iconify';

import { ComponentBox } from '../../layout';

// ----------------------------------------------------------------------

const COLORS = ['default', 'primary', 'secondary', 'error', 'info', 'success', 'warning'];

const componentBoxStyles = {
  gap: 2,
};

// ----------------------------------------------------------------------

export function ChipVariant({ variant }) {
  const handleDelete = useCallback(() => {
    console.info('You clicked the delete icon.');
  }, []);

  return (
    <Box
      sx={{
        rowGap: 5,
        columnGap: 3,
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(1, 1fr)', md: 'repeat(2, 1fr)' },
      }}
    >
      <ComponentBox title="Colors" sx={componentBoxStyles}>
        {COLORS.map((color) => (
          <Fragment key={color}>
            <Chip
              clickable
              color={color}
              variant={variant}
              label="Clickable"
              avatar={<Avatar>M</Avatar>}
            />
            <Chip
              color={color}
              variant={variant}
              label="Deletable"
              avatar={<Avatar>M</Avatar>}
              onDelete={handleDelete}
            />
          </Fragment>
        ))}
      </ComponentBox>

      <div>
        <ComponentBox title="Custom icons" sx={componentBoxStyles}>
          <Chip
            variant={variant}
            label="Custom icon"
            onDelete={handleDelete}
            icon={<Iconify width={24} icon="eva:smiling-face-fill" />}
            deleteIcon={<Iconify icon="eva:checkmark-fill" />}
          />

          <Chip
            color="info"
            variant={variant}
            label="Custom icon"
            onDelete={handleDelete}
            avatar={<Avatar>M</Avatar>}
            deleteIcon={<Iconify icon="solar:trash-bin-trash-bold" />}
          />
        </ComponentBox>

        <ComponentBox title="Disabled" sx={{ ...componentBoxStyles, my: 5 }}>
          <Chip
            disabled
            variant={variant}
            label="Disabled"
            onDelete={handleDelete}
            icon={<Iconify width={24} icon="eva:smiling-face-fill" />}
          />

          <Chip
            disabled
            color="info"
            variant={variant}
            label="Disabled"
            onDelete={handleDelete}
            avatar={<Avatar>M</Avatar>}
          />
        </ComponentBox>

        <ComponentBox title="Sizes" sx={componentBoxStyles}>
          <Chip
            color="info"
            variant={variant}
            label="Normal"
            onDelete={handleDelete}
            icon={<Iconify width={24} icon="eva:smiling-face-fill" />}
          />

          <Chip
            color="info"
            size="small"
            variant={variant}
            label="Small"
            onDelete={handleDelete}
            avatar={<Avatar>M</Avatar>}
          />
        </ComponentBox>
      </div>
    </Box>
  );
}
