import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme/useTheme';
import { spacing } from '../theme';

interface DataPoint {
  name: string;
  total: number;
  color: string;
}

const WIDTH  = Dimensions.get('window').width - spacing.md * 4;
const HEIGHT = 140;
const BAR_W  = 24;

export function SpendingChart({ data }: { data: DataPoint[] }) {
  const { colors } = useTheme();
  if (!data?.length) return null;

  const max     = Math.max(...data.map(d => d.total), 1);
  const barStep = WIDTH / data.length;

  return (
    <View style={[s.container, { backgroundColor: colors.surface }]}>
      <Svg width={WIDTH} height={HEIGHT + 20}>
        {data.map((d, i) => {
          const barH = Math.max(4, (d.total / max) * HEIGHT);
          const x    = i * barStep + barStep / 2 - BAR_W / 2;
          const y    = HEIGHT - barH;
          return (
            <React.Fragment key={d.name}>
              <Rect x={x} y={y} width={BAR_W} height={barH} rx={6} fill={d.color} opacity={0.85} />
              <SvgText x={x + BAR_W / 2} y={HEIGHT + 14} fontSize={10} fill={colors.textSubtle} textAnchor="middle">
                {d.name.length > 6 ? d.name.slice(0, 6) + '…' : d.name}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  container: { borderRadius: 12, padding: spacing.md },
});
