/* eslint-disable react/prop-types */
import { AdminSidebar, Bar, TableBody, Table, TableContainer, TableHeaders, TableHeading, KYCRow, Loader } from "../components";
import Select, { components } from "react-select";
import { CUSTOME_STYLES } from "../assets/data/constants";
import { FaSort } from "react-icons/fa";
import { useDispatch, useSelector } from "react-redux";
import { useEffect, useState } from "react";
import { getAllUsers, verifyUser } from "../redux/actions/index";
import { toast } from "react-toastify";

const kycSortOptions = [
	{ value: "", label: "Sort By" },
	{ value: "Pending", label: "Pending" },
	{ value: "Approved", label: "Approved" },
];

// Your existing components and imports...

const kycHeaders = ["User Id", "First Name", "Last Name", "Contact Number", "Email Id", "Verification Status"];

function Kyc() {
	const { users, loading: userLoading } = useSelector((state) => state.user);
	const { message, error, loading } = useSelector((state) => state.update);
	const [usersdata, setUsersdata] = useState([]);
	const [searchQuery, setSearchQuery] = useState("");
	const [userQuery, setUserQuery] = useState("");
	const [selectedSortOption] = useState(kycSortOptions[0]); // Default to first sorting option
	const [todaysJoining, setTodaysJoining] = useState([]);
	const dispatch = useDispatch();

	// Filter function to filter usersdata based on search query
	const filteredData = usersdata.filter((user) => {
		const searchTerm = searchQuery.toLowerCase();
		return user.data.some((item) => item.toLowerCase().includes(searchTerm));
	});

	// Sorting function based on selected sort option
	const sortedData = filteredData.sort((a, b) => {
		if (selectedSortOption.value === "Pending") {
			return a.status.localeCompare(b.status);
		} else if (selectedSortOption.value === "Approved") {
			return b.status.localeCompare(a.status);
		} else {
			return 0;
		}
	});

	const userVerifyHandler = (userId, verify) => {
		if (userId) {
			dispatch(verifyUser(userId, verify));
			dispatch(getAllUsers());
		} else {
			toast.error("User Is not Selected");
		}
	};

	useEffect(() => {
		if (users && users.length > 0) {
			const processedUsersData = users
				.filter((user) => user.role === "user")
				.map((user) => ({
					data: [`ID-${user.userId}`, user.firstName, user.lastName, user.contact, user.email],
					status: user.verified === "approved" ? "Approved" : "Pending",
					_id: user.userId, // Assuming user ID can be used as _id
				}))
				.reverse();

			setUsersdata(processedUsersData); // Update state with the processed user data
		}
	}, [users]);

	useEffect(() => {
		if (users) {
			// Get today's date
			const today = new Date();
			today.setHours(0, 0, 0, 0); // Set hours, minutes, seconds, and milliseconds to 0 for accurate comparison

			// Filter users whose createdAt date is today
			const todaysJoiningUsers = users.filter((user) => {
				// Convert user's createdAt date to a Date object
				const userCreatedAt = new Date(user.createdAt);
				// Set hours, minutes, seconds, and milliseconds to 0 for accurate comparison
				userCreatedAt.setHours(0, 0, 0, 0);
				// Compare with today's date
				return userCreatedAt.getTime() <= today.getTime();
			});

			// Map filtered users to the desired format
			const data = todaysJoiningUsers.map((user) => {
				return {
					avatar: user?.avatar,
					role: user.role,
					aadhar: user?.aadharCard,
					id: user._id,
					verified: user.verified,
					status: user?.plan,
				};
			});

			const filterUserData = data.filter((user) => user.role !== "admin");
			const verifiedUserData = filterUserData.filter((user) => user.verified !== "approved");
			// Set the state with filtered users
			setTodaysJoining(verifiedUserData);
		}
	}, [users, loading]);

	useEffect(() => {
		if (message) {
			toast.success(message);
			dispatch({ type: "CLEAR_MESSAGES" });
		}
		if (error) {
			toast.error(error);
			dispatch({ type: "CLEAR_ERRORS" });
		}
	}, [message, error, dispatch]);

	if (loading) {
		return <Loader />;
	}
	if (userLoading) {
		return <Loader />;
	}

	return (
		<div className="admin-container">
			<AdminSidebar />
			<main className="kycPage">
				<Bar heading="KYC" />
				<section className="kyc">
					{/* Your existing JSX code */}
					<TableContainer className="kycTable">
						<TableHeading>
							<p>Registration List</p>
							{/* Search input field */}
							<input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
						</TableHeading>
						<Table>
							<TableHeaders
								style={{
									gridTemplateColumns: `repeat(${kycHeaders.length},1fr)`,
								}}
								headers={kycHeaders}
							/>
							<TableBody TableRow={KYCRow} data={sortedData} /> {/* Render sorted data */}
						</Table>
					</TableContainer>
					<section className="kycregistration">
						<div className="heading">
							<p>Registration Documents</p>
							<input type="text" placeholder="Search..." value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
						</div>

						<div className="body">
							{todaysJoining.map((user, idx) => (
								<div key={idx}>
									<div className="content">
										{user.status === "premium" ? (
											<div className="fees">
												<h1>₹</h1>
												<p>Registration Fees : 580.00 Rs</p>
											</div>
										) : (
											<div className="fees red">
												<h1>₹ 580.00</h1>
												<p>Payment not done yet</p>
											</div>
										)}

										<div className="photo">
											<p>Photo Identification</p>
											<img className="kyc-image" src={user?.avatar} alt={user?.firstName} />
										</div>

										<div className="aadhar">
											<p>Aadhar Card</p>
											<img className="kyc-image" src={user?.aadhar} alt={user?.firstName} />
										</div>
									</div>

									<div className="footer">
										<button
											onClick={() => {
												console.log(user);
												userVerifyHandler(user._id, false);
											}}
										>
											Decline
										</button>
										<button
											onClick={() => {
												userVerifyHandler(user.id, true);
											}}
										>
											Accept
										</button>
									</div>
								</div>
							))}
						</div>
					</section>
				</section>
			</main>
		</div>
	);
}

export default Kyc;

// Your existing components and exports...

export const CardWidget = ({ heading, Icon, Action, value, style }) => {
	return (
		<article className="pinCard" style={style}>
			<Icon />
			<div>
				<h3>{heading}</h3>
				{value && <p>{value}</p>}
			</div>
			<Action />
		</article>
	);
};
