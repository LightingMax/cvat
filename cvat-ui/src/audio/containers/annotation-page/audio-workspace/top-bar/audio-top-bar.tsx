// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { connect } from 'react-redux';
import { withRouter } from 'react-router';
import { RouteComponentProps } from 'react-router-dom';

import {
    changeWorkspaceAsync,
    collectStatisticsAsync,
    setForceExitAnnotationFlag as setForceExitAnnotationFlagAction,
    showFilters as showFiltersAction,
    showStatistics as showStatisticsAction,
} from 'actions/annotation-actions';
import {
    audioActions, audioRedoAsync, audioUndoAsync, toggleAudioPlayback,
} from 'actions/audio-actions';
import type { AudioSeekRequest } from 'actions/audio-actions';
import AudioTopBarComponent from 'audio/components/annotation-page/audio-workspace/top-bar/audio-top-bar';
import { Job } from 'cvat-core-wrapper';
import { CombinedState, Workspace } from 'reducers';
import { KeyMap } from 'utils/mousetrap-react';
import { writeLatestFrame } from 'utils/remember-latest-frame';
import { jobHasUnsavedChanges } from 'utils/annotation';

interface StateToProps {
    jobInstance: Job;
    frameNumber: number;
    playing: boolean;
    saving: boolean;
    undoAction?: string;
    redoAction?: string;
    workspace: Workspace;
    keyMap: KeyMap;
    normalizedKeyMap: Record<string, string>;
    forceExit: boolean;
    annotationFilters: object[];
    initialOpenGuide: boolean;
    audioDuration: number;
}

interface DispatchToProps {
    showStatistics(sessionInstance: Job): void;
    showFilters(): void;
    audioUndo(): void;
    audioRedo(): void;
    setForceExitAnnotationFlag(forceExit: boolean): void;
    changeWorkspace(workspace: Workspace): void;
    onAudioPlayPause(): void;
    onAudioSeek(request: AudioSeekRequest): void;
}

function mapStateToProps(state: CombinedState): StateToProps {
    const {
        annotation: {
            player: {
                frame: { number: frameNumber },
            },
            annotations: {
                saving: { uploading: saving, forceExit },
                filters: annotationFilters,
                history: annotationsHistory,
            },
            job: { instance: jobInstance, queryParameters: { initialOpenGuide } },
            workspace,
        },
        audio: {
            player: {
                playing,
                duration: audioDuration,
            },
        },
        shortcuts: { keyMap, normalizedKeyMap },
    } = state;

    return {
        jobInstance: jobInstance as Job,
        frameNumber,
        playing,
        saving,
        undoAction: annotationsHistory.undo.length ?
            annotationsHistory.undo[annotationsHistory.undo.length - 1][0] : undefined,
        redoAction: annotationsHistory.redo.length ?
            annotationsHistory.redo[annotationsHistory.redo.length - 1][0] : undefined,
        workspace,
        keyMap,
        normalizedKeyMap,
        forceExit,
        annotationFilters,
        initialOpenGuide,
        audioDuration,
    };
}

function mapDispatchToProps(dispatch: any): DispatchToProps {
    return {
        showStatistics(sessionInstance: Job): void {
            dispatch(collectStatisticsAsync(sessionInstance));
            dispatch(showStatisticsAction(true));
        },
        showFilters(): void {
            dispatch(showFiltersAction(true));
        },
        audioUndo(): void {
            dispatch(audioUndoAsync());
        },
        audioRedo(): void {
            dispatch(audioRedoAsync());
        },
        changeWorkspace(workspace: Workspace): void {
            dispatch(changeWorkspaceAsync(workspace));
        },
        setForceExitAnnotationFlag(forceExit: boolean): void {
            dispatch(setForceExitAnnotationFlagAction(forceExit));
        },
        onAudioPlayPause(): void {
            dispatch(toggleAudioPlayback());
        },
        onAudioSeek(request: AudioSeekRequest): void {
            dispatch(audioActions.seekAudio(request));
        },
    };
}

type Props = StateToProps & DispatchToProps & RouteComponentProps;

class AudioTopBarContainer extends React.PureComponent<Props> {
    private unblock: any;

    public componentDidMount(): void {
        const {
            history, jobInstance, setForceExitAnnotationFlag,
        } = this.props;

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        this.unblock = history.block((location: any) => {
            const { forceExit, frameNumber } = self.props;
            const { id: jobID, taskId: taskID } = jobInstance;
            writeLatestFrame(jobInstance.id, frameNumber);

            if (
                jobHasUnsavedChanges(jobInstance) &&
                location.pathname !== `/tasks/${taskID}/jobs/${jobID}` &&
                !forceExit
            ) {
                return 'You have unsaved changes, please confirm leaving this page.';
            }

            if (forceExit) {
                setForceExitAnnotationFlag(false);
            }

            return undefined;
        });

        window.addEventListener('beforeunload', this.beforeUnloadCallback);
    }

    public componentWillUnmount(): void {
        window.removeEventListener('beforeunload', this.beforeUnloadCallback);
        this.unblock();
    }

    private undo = (): void => {
        const { audioUndo, undoAction } = this.props;
        if (undoAction) audioUndo();
    };

    private redo = (): void => {
        const { audioRedo, redoAction } = this.props;
        if (redoAction) audioRedo();
    };

    private changeWorkspace = (workspace: Workspace): void => {
        const { changeWorkspace } = this.props;
        changeWorkspace(workspace);
        if (window.document.activeElement) {
            (window.document.activeElement as HTMLElement).blur();
        }
    };

    private beforeUnloadCallback = (event: BeforeUnloadEvent): string | undefined => {
        const {
            jobInstance, forceExit, setForceExitAnnotationFlag, frameNumber,
        } = this.props;

        writeLatestFrame(jobInstance.id, frameNumber);
        if (jobHasUnsavedChanges(jobInstance) && !forceExit) {
            const confirmationMessage = 'You have unsaved changes, please confirm leaving this page.';
            // eslint-disable-next-line no-param-reassign
            event.returnValue = confirmationMessage;
            return confirmationMessage;
        }

        if (forceExit) {
            setForceExitAnnotationFlag(false);
        }
        return undefined;
    };

    public render(): JSX.Element {
        const {
            playing,
            saving,
            jobInstance,
            undoAction,
            redoAction,
            workspace,
            keyMap,
            normalizedKeyMap,
            annotationFilters,
            initialOpenGuide,
            audioDuration,
            onAudioPlayPause,
            onAudioSeek,
            showFilters,
            showStatistics,
        } = this.props;

        return (
            <AudioTopBarComponent
                playing={playing}
                saving={saving}
                workspace={workspace}
                jobInstance={jobInstance}
                keyMap={keyMap}
                undoAction={undoAction}
                redoAction={redoAction}
                undoShortcut={normalizedKeyMap.AUDIO_UNDO ?? normalizedKeyMap.UNDO}
                redoShortcut={normalizedKeyMap.AUDIO_REDO ?? normalizedKeyMap.REDO}
                playPauseShortcut={normalizedKeyMap.PLAY_PAUSE_AUDIO}
                backwardShortcut={normalizedKeyMap.AUDIO_BACKWARD}
                forwardShortcut={normalizedKeyMap.AUDIO_FORWARD}
                fastBackwardShortcut={normalizedKeyMap.AUDIO_FAST_BACKWARD}
                fastForwardShortcut={normalizedKeyMap.AUDIO_FAST_FORWARD}
                audioDuration={audioDuration ?? 0}
                annotationFilters={annotationFilters}
                initialOpenGuide={initialOpenGuide}
                changeWorkspace={this.changeWorkspace}
                showFilters={showFilters}
                showStatistics={() => showStatistics(jobInstance)}
                onUndoClick={this.undo}
                onRedoClick={this.redo}
                onAudioPlayPause={onAudioPlayPause}
                onAudioSeek={onAudioSeek}
            />
        );
    }
}

export default withRouter(connect(mapStateToProps, mapDispatchToProps)(AudioTopBarContainer));
