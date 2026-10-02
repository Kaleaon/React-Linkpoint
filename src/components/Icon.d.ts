import React from 'react';

export interface IconProps {
  name: string;
  size?: number;
  style?: React.CSSProperties;
  className?: string;
  strokeWidth?: number;
  [key: string]: any;
}

export default function Icon(props: IconProps): React.ReactElement;
