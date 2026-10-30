import React from 'react';

export type FormFieldProps = (
  | {
      label: React.ReactNode;
      'aria-label'?: string;
    }
  | {
      label?: React.ReactNode;
      'aria-label': string;
    }
) & {
  error?: React.ReactNode;
  helpText?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  [key: string]: any;
};

export default function FormField(props: FormFieldProps): React.ReactElement;
