import { useState, useCallback } from 'react';

import Box from '@mui/material/Box';
import List from '@mui/material/List';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Checkbox from '@mui/material/Checkbox';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import ListItemText from '@mui/material/ListItemText';
import ListItemButton from '@mui/material/ListItemButton';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

export function not(a, b) {
  return a.filter((value) => b.indexOf(value) === -1);
}

export function intersection(a, b) {
  return a.filter((value) => b.indexOf(value) !== -1);
}

export function union(a, b) {
  return [...a, ...not(b, a)];
}

function numberOfChecked(selectedItems, items) {
  return intersection(selectedItems, items).length;
}

// ----------------------------------------------------------------------

export function EnhancedTransferList() {
  const theme = useTheme();

  const [selectedItems, setSelectedItems] = useState([]);

  const [leftList, setLeftList] = useState([0, 1, 2, 3]);
  const [rightList, setRightList] = useState([4, 5, 6, 7]);

  const leftChecked = intersection(selectedItems, leftList);
  const rightChecked = intersection(selectedItems, rightList);

  const isRtl = theme.direction === 'rtl';

  const handleToggle = useCallback(
    (value) => () => {
      const currentIndex = selectedItems.indexOf(value);

      const newChecked = [...selectedItems];

      if (currentIndex === -1) {
        newChecked.push(value);
      } else {
        newChecked.splice(currentIndex, 1);
      }

      setSelectedItems(newChecked);
    },
    [selectedItems]
  );

  const handleToggleAll = useCallback(
    (items) => () => {
      if (numberOfChecked(selectedItems, items) === items.length) {
        setSelectedItems(not(selectedItems, items));
      } else {
        setSelectedItems(union(selectedItems, items));
      }
    },
    [selectedItems]
  );

  const handleCheckedRight = useCallback(() => {
    setRightList(rightList.concat(leftChecked));
    setLeftList(not(leftList, leftChecked));
    setSelectedItems(not(selectedItems, leftChecked));
  }, [selectedItems, leftChecked, leftList, rightList]);

  const handleCheckedLeft = useCallback(() => {
    setLeftList(leftList.concat(rightChecked));
    setRightList(not(rightList, rightChecked));
    setSelectedItems(not(selectedItems, rightChecked));
  }, [selectedItems, leftList, rightChecked, rightList]);

  const noData = (
    <Box
      sx={{
        height: 1,
        display: 'flex',
        alignItems: 'center',
        color: 'text.secondary',
        justifyContent: 'center',
        fontWeight: 'fontWeightMedium',
      }}
    >
      No items
    </Box>
  );

  const renderList = (title, items, direction) => (
    <Card sx={{ width: 220 }}>
      <Box sx={{ px: 1, py: 1.5, gap: 0.5, display: 'flex', alignItems: 'center' }}>
        <Checkbox
          onClick={handleToggleAll(items)}
          checked={numberOfChecked(selectedItems, items) === items.length && items.length !== 0}
          indeterminate={
            numberOfChecked(selectedItems, items) !== items.length &&
            numberOfChecked(selectedItems, items) !== 0
          }
          disabled={items.length === 0}
          slotProps={{
            input: {
              id: `enhanced-${direction}-all-checkbox`,
              'aria-label': `Enhanced ${direction} all checkbox`,
            },
          }}
        />
        <div>
          <Typography variant="subtitle2">{title}</Typography>
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary' }}
          >{`${numberOfChecked(selectedItems, items)}/${items.length} selected`}</Typography>
        </div>
      </Box>

      <Divider />

      <List dense component="div" role="list" sx={{ overflow: 'auto', height: 200 }}>
        {items.length
          ? items.map((value) => (
              <ListItemButton
                key={value}
                role="listitem"
                onClick={handleToggle(value)}
                sx={{ px: 1, gap: 0.5 }}
              >
                <Checkbox
                  disableRipple
                  checked={selectedItems.indexOf(value) !== -1}
                  tabIndex={-1}
                  slotProps={{
                    input: {
                      id: `enhanced-${value}-checkbox`,
                      'aria-label': `Enhanced ${value} checkbox`,
                    },
                  }}
                />
                <ListItemText primary={`List item ${value + 1}`} />
              </ListItemButton>
            ))
          : noData}
      </List>
    </Card>
  );

  return (
    <Grid
      container
      sx={{
        p: 3,
        width: 'auto',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Grid>{renderList('Choices', leftList, 'left')}</Grid>

      <Grid container direction="column" sx={{ alignItems: 'center', px: 4, gap: 1.5 }}>
        <Button
          color="inherit"
          variant="outlined"
          size="small"
          onClick={isRtl ? handleCheckedLeft : handleCheckedRight}
          disabled={isRtl ? rightChecked.length === 0 : leftChecked.length === 0}
          aria-label="move selected right"
        >
          <Iconify width={18} icon="eva:arrow-ios-forward-fill" />
        </Button>

        <Button
          color="inherit"
          variant="outlined"
          size="small"
          onClick={isRtl ? handleCheckedRight : handleCheckedLeft}
          disabled={isRtl ? leftChecked.length === 0 : rightChecked.length === 0}
          aria-label="move selected left"
        >
          <Iconify width={18} icon="eva:arrow-ios-back-fill" />
        </Button>
      </Grid>

      <Grid>{renderList('Chosen', rightList, 'right')}</Grid>
    </Grid>
  );
}
