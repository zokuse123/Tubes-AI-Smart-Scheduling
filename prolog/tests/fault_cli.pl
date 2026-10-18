:- module(fault_cli, [main/0, injected_failure/2]).

:- use_module('../solver_cli', []).

main :-
    solver_cli:main_with_solver(fault_cli:injected_failure).

injected_failure(_, _) :-
    throw(test_fault).
