import React from 'react'
import { Result, Button } from 'antd'

interface State { hasError: boolean; error: string }

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, error: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="error"
          title="Something went wrong"
          subTitle={this.state.error || 'An unexpected error occurred in this section.'}
          extra={
            <Button type="primary" onClick={() => { this.setState({ hasError: false, error: '' }) }}>
              Try Again
            </Button>
          }
        />
      )
    }
    return this.props.children
  }
}
