import React from 'react';
import { FlexWidget, TextWidget, ImageWidget } from 'react-native-android-widget';

interface Props {
  total: number;
  dateLabel: string;
}

export function DailyLogWidget({ total, dateLabel }: Props) {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: '#1e1b4b',
        borderRadius: 20,
        padding: 16,
        justifyContent: 'space-between',
      }}
      clickAction="OPEN_APP"
    >
      {/* Header */}
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TextWidget
          text="📊 Daily Spending"
          style={{ fontSize: 13, color: '#a5b4fc', fontFamily: 'sans-serif-medium' }}
        />
        <FlexWidget
          style={{
            backgroundColor: '#6366f1',
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
          clickAction="OPEN_APP"
          clickActionData={{ screen: 'daily-log' }}
        >
          <TextWidget
            text="+ Add"
            style={{ fontSize: 12, color: '#ffffff', fontFamily: 'sans-serif-medium' }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* Date */}
      <TextWidget
        text={dateLabel}
        style={{ fontSize: 12, color: '#818cf8', fontFamily: 'sans-serif' }}
      />

      {/* Amount */}
      <FlexWidget style={{ flexDirection: 'column' }}>
        <TextWidget
          text="Spent today"
          style={{ fontSize: 11, color: '#6366f1', fontFamily: 'sans-serif' }}
        />
        <TextWidget
          text={`€${total.toFixed(2)}`}
          style={{ fontSize: 28, color: '#ffffff', fontFamily: 'sans-serif-medium' }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
