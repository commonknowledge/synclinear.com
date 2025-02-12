import { CheckIcon, DotsHorizontalIcon } from "@radix-ui/react-icons";
import React, { useCallback, useEffect, useState } from "react";
import { LinearContext, LinearObject, LinearTeam } from "../typings";
import {
    checkForExistingTeam,
    clearURLParams,
    exchangeLinearToken,
    getLinearAuthURL,
    getLinearContext,
    saveLinearContext,
    setLinearWebhook
} from "../utils";
import { v4 as uuid } from "uuid";
import { LINEAR } from "../utils/constants";
import DeployButton from "./DeployButton";

interface IProps {
    onAuth: (apiKey: string) => void;
    onDeployWebhook: (context: LinearContext) => void;
    restoredApiKey: string;
    restored: boolean;
}

const LinearAuthButton = ({
    onAuth,
    onDeployWebhook,
    restoredApiKey,
    restored
}: IProps) => {
    const [accessToken, setAccessToken] = useState("");
    const [teams, setTeams] = useState<Array<LinearTeam>>([]);
    const [chosenTeam, setChosenTeam] = useState<LinearTeam>();
    const [user, setUser] = useState<LinearObject>();
    const [deployed, setDeployed] = useState(false);
    const [loading, setLoading] = useState(false);

    // If present, exchange the temporary auth code for an access token
    useEffect(() => {
        if (accessToken) return;

        // If the URL params have an auth code, we're returning from the Linear auth page
        const authResponse = new URLSearchParams(window.location.search);
        if (!authResponse.has("code")) return;

        // Ensure the verification code is unchanged
        const verificationCode = localStorage.getItem("linear-verification");
        if (!authResponse.get("state")?.includes("linear")) return;
        if (authResponse.get("state") !== verificationCode) {
            alert("Linear auth returned an invalid code. Please try again.");
            return;
        }

        setLoading(true);

        // Exchange auth code for access token
        const refreshToken = authResponse.get("code");
        exchangeLinearToken(refreshToken)
            .then(body => {
                if (body.access_token) setAccessToken(body.access_token);
                else {
                    alert("No Linear access token returned. Please try again.");
                    clearURLParams();
                    localStorage.removeItem(LINEAR.STORAGE_KEY);
                }
                setLoading(false);
            })
            .catch(err => {
                alert(`Error fetching access token: ${err}`);
                setLoading(false);
            });
    }, []);

    // Restore the Linear context from local storage
    useEffect(() => {
        if (restoredApiKey) setAccessToken(restoredApiKey);
    }, [restoredApiKey]);

    // Fetch the user ID and available teams when the token is available
    useEffect(() => {
        if (!accessToken) return;
        if (user?.id) return;

        onAuth(accessToken);

        getLinearContext(accessToken)
            .then(res => {
                if (!res?.data?.teams || !res.data?.viewer)
                    alert("No Linear user or teams found");

                setTeams(res.data.teams.nodes);
                setUser(res.data.viewer);
            })
            .catch(err => alert(`Error fetching labels: ${err}`));
    }, [accessToken]);

    // Disable webhook deployment button if the team already exists
    useEffect(() => {
        if (!chosenTeam) return;

        setLoading(true);

        checkForExistingTeam(chosenTeam.id)
            .then(res => {
                if (res?.exists) {
                    setDeployed(true);
                    onDeployWebhook({
                        userId: user.id,
                        teamId: chosenTeam.id,
                        apiKey: accessToken
                    });
                } else {
                    setDeployed(false);
                }
                setLoading(false);
            })
            .catch(err => {
                alert(`Error checking for existing labels: ${err}`);
                setLoading(false);
            });
    }, [chosenTeam]);

    const openLinearAuth = () => {
        // Generate random code to validate against CSRF attack
        const verificationCode = `linear-${uuid()}`;
        localStorage.setItem("linear-verification", verificationCode);

        const authURL = getLinearAuthURL(verificationCode);
        window.location.replace(authURL);
    };

    const deployWebhook = useCallback(() => {
        if (!chosenTeam || deployed) return;

        saveLinearContext(accessToken, chosenTeam).catch(err =>
            alert(`Error saving labels to DB: ${err}`)
        );

        setLinearWebhook(accessToken, chosenTeam.id)
            .then(() => {
                setDeployed(true);
                onDeployWebhook({
                    userId: user.id,
                    teamId: chosenTeam.id,
                    apiKey: accessToken
                });
            })
            .catch(err => alert(`Error deploying webhook: ${err}`));

        setDeployed(true);
    }, [accessToken, chosenTeam, deployed, user]);

    return (
        <div className="center space-y-8 w-80">
            <button
                onClick={openLinearAuth}
                disabled={!!accessToken || loading}
                className={loading ? "animate-pulse" : ""}
                arial-label="Authorize with Linear"
            >
                {loading ? (
                    <>
                        <span>Loading</span>
                        <DotsHorizontalIcon className="w-6 h-6" />
                    </>
                ) : (
                    <span>1. Connect Linear</span>
                )}
                {!!accessToken && <CheckIcon className="w-6 h-6" />}
            </button>
            {teams.length > 0 && restored && (
                <div className="flex flex-col items-center w-full space-y-4">
                    <select
                        name="Linear team"
                        disabled={deployed || loading}
                        onChange={e =>
                            setChosenTeam(
                                teams.find(team => team.id === e.target.value)
                            )
                        }
                    >
                        <option value="" disabled selected>
                            3. Select your team
                        </option>
                        {teams.map(team => (
                            <option key={team.id} value={team.id}>
                                {team.name}
                            </option>
                        ))}
                    </select>
                    {chosenTeam && (
                        <DeployButton
                            loading={loading}
                            deployed={deployed}
                            onDeploy={deployWebhook}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default LinearAuthButton;

