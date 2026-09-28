fn main() {
    // Before the runtime starts any thread: PATH is process-wide state.
    gxserver::prepare_process_environment();
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("start the gxserver runtime");
    runtime.block_on(async {
        if let Err(error) = gxserver::cli::run_from_env().await {
            eprintln!("{error}");
            std::process::exit(1);
        }
    });
}
