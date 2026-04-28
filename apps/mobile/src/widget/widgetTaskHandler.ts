import React from 'react';
import { format } from 'date-fns';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { getDailySpendTotal } from '../db/queries';
import { DailyLogWidget } from './DailyLogWidget';

async function renderDailyLog(renderWidget: WidgetTaskHandlerProps['renderWidget']) {
  const today = new Date();
  const dateStr = format(today, 'yyyy-MM-dd');
  const dateLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  let total = 0;
  try {
    total = await getDailySpendTotal(dateStr);
  } catch {
    total = 0;
  }

  await renderWidget(
    React.createElement(DailyLogWidget, { total, dateLabel })
  );
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      await renderDailyLog(props.renderWidget);
      break;

    case 'WIDGET_CLICK':
      // All taps open the app — handled by clickAction="OPEN_APP" on components
      await renderDailyLog(props.renderWidget);
      break;

    default:
      break;
  }
}
