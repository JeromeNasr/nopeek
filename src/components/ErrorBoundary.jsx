import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
    this.handleReset = this.handleReset.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  handleReset() {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state

    if (!error) return this.props.children

    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">Something went wrong</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{error.message}</p>
        <button
          type="button"
          onClick={this.handleReset}
          className="mt-6 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          Try again
        </button>
      </div>
    )
  }
}
