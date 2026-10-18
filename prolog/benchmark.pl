:- module(benchmark, [main/0, benchmark_dataset/5]).

:- use_module(library(http/json)).
:- use_module(library(time)).
:- use_module(solver).
:- use_module(validation).

benchmark_size(small, 5, 5, 3, 10, 10).
benchmark_size(medium, 10, 10, 5, 20, 15).
benchmark_size(initial_target, 20, 20, 10, 40, 25).

benchmark_strategy(ffc_up, [ffc, up]).
benchmark_strategy(ff_up, [ff, up]).
benchmark_strategy(leftmost_up, [leftmost, up]).

main :-
    Repetitions = 3,
    TimeoutSeconds = 5,
    findall(Result,
            ( benchmark_size(Name, Groups, Assistants, Labs, Practices, Slots),
              member(Scenario, [feasible, controlled_unsatisfiable]),
              benchmark_strategy(StrategyName, Options),
              benchmark_dataset(Name-Scenario,
                                size{kelompok:Groups, asisten:Assistants,
                                     laboratorium:Labs, praktikum:Practices,
                                     slot_waktu:Slots},
                                StrategyName-Options,
                                run{repetitions:Repetitions,
                                    timeout_seconds:TimeoutSeconds},
                                Result)
            ),
            Results),
    environment(Environment),
    Report = _{measurement:"internal_solver_only",
               environment:Environment,
               repetitions:Repetitions,
               timeout_seconds:TimeoutSeconds,
               results:Results},
    json_write_dict(current_output, Report, [width(0)]),
    nl.

benchmark_dataset(Name-Scenario, Size, StrategyName-Options, Run, Result) :-
    make_dataset(Size, Scenario, Raw, Witness),
    once(validate_input(Raw, Data)),
    ( Scenario == feasible -> verify_solution(Data, Witness) ; true ),
    findall(Observation,
            ( between(1, Run.repetitions, _),
              benchmark_once(Data, Options, Run.timeout_seconds, Observation)
            ),
            Observations),
    observation_summary(Observations, Status, Timing, AssignmentCounts,
                        Fingerprints),
    Result = _{dataset:Name, scenario:Scenario, size:Size,
               strategy:StrategyName, status:Status,
               duration_ms:Timing, assignment_counts:AssignmentCounts,
               solution_fingerprints:Fingerprints}.

benchmark_once(Data, Options, Timeout, Observation) :-
    get_time(Start),
    catch(call_with_time_limit(
              Timeout,
              ( once(solve_with_options(Data, Options, Assignments)) ->
                    verify_solution(Data, Assignments),
                    assignment_fingerprint(Assignments, Fingerprint),
                    Status = success
              ;     Assignments = [], Fingerprint = null,
                    Status = unsatisfiable
              )),
          Error,
          benchmark_exception(Error, Status, Assignments, Fingerprint)),
    get_time(End),
    DurationMs is (End - Start) * 1000.0,
    length(Assignments, AssignmentCount),
    Observation = observation{status:Status, duration_ms:DurationMs,
                              assignment_count:AssignmentCount,
                              fingerprint:Fingerprint}.

benchmark_exception(time_limit_exceeded, timeout, [], null) :- !.
benchmark_exception(_, internal_error, [], null).

observation_summary(Observations, Status, Timing, AssignmentCounts,
                    Fingerprints) :-
    maplist(observation_status, Observations, Statuses),
    ( sort(Statuses, [Status]) -> true ; Status = mixed ),
    maplist(observation_duration, Observations, Durations),
    sort(Durations, Sorted),
    Sorted = [Minimum|_], last(Sorted, Maximum),
    length(Sorted, Length), Middle is Length // 2,
    nth0(Middle, Sorted, Median),
    Timing = _{min:Minimum, median:Median, max:Maximum},
    maplist(observation_assignment_count, Observations, AssignmentCounts),
    maplist(observation_fingerprint, Observations, Fingerprints).

observation_status(O, O.status).
observation_duration(O, O.duration_ms).
observation_assignment_count(O, O.assignment_count).
observation_fingerprint(O, O.fingerprint).

make_dataset(Size, Scenario, Data, Witness) :-
    integer_range(Size.kelompok, Groups, group),
    integer_range(Size.asisten, Assistants, assistant),
    integer_range(Size.laboratorium, Labs, laboratory),
    integer_range(Size.slot_waktu, Slots, slot),
    integer_range(Size.praktikum, Practices, practice),
    all_availability(Groups, Slots, kelompok_id, GroupAvailabilityAll),
    all_availability(Assistants, Slots, asisten_id, AssistantAvailabilityAll),
    scenario_availability(Scenario, Groups, Assistants,
                          GroupAvailabilityAll, AssistantAvailabilityAll,
                          GroupAvailability, AssistantAvailability),
    findall(_{id:I}, member(I, [1]), Mata),
    maplist(group_dict, Groups, GroupDicts),
    maplist(id_dict, Assistants, AssistantDicts),
    maplist(lab_dict, Labs, LabDicts),
    maplist(slot_dict, Slots, SlotDicts),
    maplist(practice_dict(Size.kelompok, Size.asisten), Practices,
            PracticeDicts),
    Data = _{schema_version:1, source_revision:900,
             mata_praktikum:Mata, kelompok:GroupDicts,
             asisten:AssistantDicts, laboratorium:LabDicts,
             slot_waktu:SlotDicts, praktikum:PracticeDicts,
             ketersediaan_kelompok:GroupAvailability,
             ketersediaan_asisten:AssistantAvailability},
    feasible_witness(Practices, Size.slot_waktu, Witness).

integer_range(Count, Values, _) :-
    findall(I, between(1, Count, I), Values).

group_dict(Id, _{id:Id, jumlah_peserta:20}).
id_dict(Id, _{id:Id}).
lab_dict(Id, _{id:Id, kapasitas:30}).
practice_dict(GroupCount, AssistantCount, Id,
              _{id:Id, mata_praktikum_id:1,
                kelompok_id:GroupId, asisten_id:AssistantId}) :-
    GroupId is ((Id - 1) mod GroupCount) + 1,
    AssistantId is ((Id - 1) mod AssistantCount) + 1.

slot_dict(Id, _{id:Id, hari:Day,
                jam_mulai:StartString, jam_selesai:EndString}) :-
    Day is ((Id - 1) // 5) + 1,
    Position is (Id - 1) mod 5,
    Start is 480 + Position * 120,
    End is Start + 120,
    minute_string(Start, StartString),
    minute_string(End, EndString).

minute_string(Minutes, String) :-
    Hour is Minutes // 60, Minute is Minutes mod 60,
    format(string(String), '~|~`0t~d~2+:~|~`0t~d~2+', [Hour, Minute]).

all_availability(Owners, Slots, Key, Availability) :-
    findall(Item,
            ( member(Owner, Owners), member(Slot, Slots),
              dict_create(Item, _, [Key-Owner, slot_id-Slot])
            ), Availability).

scenario_availability(feasible, _, _, GA, AA, GA, AA).
scenario_availability(controlled_unsatisfiable, Groups, Assistants, _, _, GA, AA) :-
    all_availability(Groups, [1], kelompok_id, GA),
    all_availability(Assistants, [1], asisten_id, AA).

feasible_witness(Practices, SlotCount, Witness) :-
    maplist(witness_assignment(SlotCount), Practices, Witness).

witness_assignment(SlotCount, Id,
                   _{praktikum_id:Id, slot_id:SlotId,
                     laboratorium_id:LabId}) :-
    SlotId is ((Id - 1) mod SlotCount) + 1,
    LabId is ((Id - 1) // SlotCount) + 1.

verify_solution(Data, Assignments) :-
    maplist(assignment_id, Assignments, AssignmentIds),
    maplist(practice_id, Data.praktikum, PracticeIds),
    AssignmentIds == PracticeIds,
    forall(member(A, Assignments), valid_assignment(Data, A)),
    forall((select(A, Assignments, Rest), member(B, Rest)),
           valid_pair(Data, A, B)).

assignment_id(A, A.praktikum_id).
practice_id(P, P.id).

valid_assignment(Data, A) :-
    member(P, Data.praktikum), P.id =:= A.praktikum_id,
    member(S, Data.slot_waktu), S.id =:= A.slot_id,
    member(L, Data.laboratorium), L.id =:= A.laboratorium_id,
    member(G, Data.kelompok), G.id =:= P.kelompok_id,
    L.kapasitas >= G.jumlah_peserta,
    memberchk(_{kelompok_id:P.kelompok_id, slot_id:A.slot_id},
              Data.ketersediaan_kelompok),
    memberchk(_{asisten_id:P.asisten_id, slot_id:A.slot_id},
              Data.ketersediaan_asisten).

valid_pair(Data, A, B) :-
    member(PA, Data.praktikum), PA.id =:= A.praktikum_id,
    member(PB, Data.praktikum), PB.id =:= B.praktikum_id,
    ( PA.kelompok_id =:= PB.kelompok_id -> A.slot_id =\= B.slot_id ; true ),
    ( PA.asisten_id =:= PB.asisten_id -> A.slot_id =\= B.slot_id ; true ),
    ( A.slot_id =:= B.slot_id -> A.laboratorium_id =\= B.laboratorium_id
    ; true ).

assignment_fingerprint(Assignments, Fingerprint) :-
    maplist(assignment_tuple, Assignments, Tuples),
    term_hash(Tuples, Fingerprint).

assignment_tuple(A, [A.praktikum_id, A.slot_id, A.laboratorium_id]).

environment(_{swi_prolog:Version, architecture:Architecture,
              operating_system:OperatingSystem}) :-
    current_prolog_flag(version_data, swi(Major, Minor, Patch, _)),
    format(string(Version), '~d.~d.~d', [Major, Minor, Patch]),
    current_prolog_flag(arch, Architecture),
    ( current_prolog_flag(windows, true) -> OperatingSystem = windows
    ; OperatingSystem = unknown ).
