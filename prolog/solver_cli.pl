:- module(solver_cli,
          [ main/0,
            main_with_solver/1,
            process_json_string/3,
            process_json_string_with_solver/4,
            process_request/3,
            process_request_with_solver/4
          ]).

:- use_module(library(http/json)).
:- use_module(validation).
:- use_module(solver).

main :-
    main_with_solver(solver:solve_with_diagnostics).

main_with_solver(Solver) :-
    catch(run_main(Solver, ExitCode),
          Error,
          boundary_failure(Error, ExitCode)),
    halt(ExitCode).

run_main(Solver, ExitCode) :-
    read_string(user_input, _, InputString),
    process_json_string_with_solver(InputString, Solver, Response, ExitCode),
    write_response(Response).

write_response(Response) :-
    json_write_dict(current_output, Response, [width(0)]),
    nl,
    flush_output(current_output).

process_json_string(InputString, Response, ExitCode) :-
    process_json_string_with_solver(InputString, solver:solve_with_diagnostics,
                                    Response, ExitCode).

process_json_string_with_solver(InputString, Solver, Response, ExitCode) :-
    catch(atom_json_dict(InputString, Input, [value_string_as(string)]),
          ParseError,
          true),
    ( var(ParseError)
    -> process_request_with_solver(Input, Solver, Response, ExitCode)
    ;  Response = _{
           schema_version:2,
           source_revision:null,
           status:invalid_input,
           error:_{code:'MALFORMED_JSON',
                   message:'Input bukan satu objek JSON yang valid.',
                   path:null}
       },
       ExitCode = 2
    ),
    !.

process_request(Input, Response, ExitCode) :-
    process_request_with_solver(Input, solver:solve_with_diagnostics,
                                Response, ExitCode).

process_request_with_solver(Input, Solver, Response, ExitCode) :-
    safe_revision(Input, Revision),
    catch(process_validated(Input, Solver, Response0, ExitCode0),
          Error,
          caught_response(Error, Revision, Response0, ExitCode0)),
    Response = Response0,
    ExitCode = ExitCode0,
    !.

process_validated(Input, Solver, Response, ExitCode) :-
    validate_input(Input, Data),
    once(call(Solver, Data, Outcome, DomainCandidates)),
    ( Outcome = success(Assignments)
    -> Response = _{schema_version:2,
                    source_revision:Data.source_revision,
                    status:success,
                    assignments:Assignments,
                    domain_candidates:DomainCandidates}
    ; Outcome == unsatisfiable
    -> Response = _{schema_version:2,
                    source_revision:Data.source_revision,
                    status:unsatisfiable,
                    assignments:[],
                    domain_candidates:DomainCandidates}
    ),
    ExitCode = 0.

caught_response(validation_error(Code, Message, Path), Revision,
                Response, 2) :-
    !,
    Response = _{schema_version:2,
                 source_revision:Revision,
                 status:invalid_input,
                 error:_{code:Code, message:Message, path:Path}}.
caught_response(Error, Revision, Response, 3) :-
    sanitized_diagnostic(Error),
    Response = _{schema_version:2,
                 source_revision:Revision,
                 status:internal_error,
                 error:_{code:'SOLVER_INTERNAL_ERROR',
                         message:'Solver gagal memproses permintaan.'}}.

safe_revision(Input, Revision) :-
    ( is_dict(Input),
      get_dict(source_revision, Input, Candidate),
      integer(Candidate)
    -> Revision = Candidate
    ;  Revision = null
    ).

sanitized_diagnostic(Error) :-
    ( nonvar(Error), compound(Error)
    -> functor(Error, Kind, _)
    ;  Kind = unexpected_error
    ),
    format(user_error, 'Solver internal error (~w).~n', [Kind]).

boundary_failure(Error, 3) :-
    sanitized_diagnostic(Error),
    Response = _{schema_version:2,
                 source_revision:null,
                 status:internal_error,
                 error:_{code:'SOLVER_INTERNAL_ERROR',
                         message:'Solver gagal memproses permintaan.'}},
    catch(write_response(Response), _, true).
